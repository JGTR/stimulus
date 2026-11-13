import { Application } from "./application"
import { Context } from "./context"
import { Definition } from "./definition"
import { readInheritableStaticArrayValues } from "./inheritable_statics"
import { Module } from "./module"
import { Multimap } from "../multimap"
import { Scope } from "./scope"
import { ScopeObserver, ScopeObserverDelegate } from "./scope_observer"

export class Router implements ScopeObserverDelegate {
  readonly application: Application
  private scopeObserver: ScopeObserver
  private scopesByIdentifier: Multimap<string, Scope>
  private modulesByIdentifier: Map<string, Module>
  private movedScopes: Map<Scope, boolean>

  constructor(application: Application) {
    this.application = application
    this.scopeObserver = new ScopeObserver(this.element, this.schema, this)
    this.scopesByIdentifier = new Multimap()
    this.modulesByIdentifier = new Map()
    this.movedScopes = new Map()
  }

  get element() {
    return this.application.element
  }

  get schema() {
    return this.application.schema
  }

  get logger() {
    return this.application.logger
  }

  get controllerAttribute(): string {
    return this.schema.controllerAttribute
  }

  get modules() {
    return Array.from(this.modulesByIdentifier.values())
  }

  get contexts() {
    return this.modules.reduce((contexts, module) => contexts.concat(module.contexts), [] as Context[])
  }

  start() {
    this.scopeObserver.start()
  }

  stop() {
    this.scopeObserver.stop()
  }

  loadDefinition(definition: Definition) {
    this.unloadIdentifier(definition.identifier)
    const module = new Module(this.application, definition)
    this.connectModule(module)
    const afterLoad = (definition.controllerConstructor as any).afterLoad
    if (afterLoad) {
      afterLoad.call(definition.controllerConstructor, definition.identifier, this.application)
    }
  }

  unloadIdentifier(identifier: string) {
    const module = this.modulesByIdentifier.get(identifier)
    if (module) {
      this.disconnectModule(module)
    }
  }

  getContextForElementAndIdentifier(element: Element, identifier: string) {
    const module = this.modulesByIdentifier.get(identifier)
    if (module) {
      return module.contexts.find((context) => context.element == element)
    }
  }

  proposeToConnectScopeForElementAndIdentifier(element: Element, identifier: string) {
    const scope = this.scopeObserver.parseValueForElementAndIdentifier(element, identifier)

    if (scope) {
      this.scopeObserver.elementMatchedValue(scope.element, scope)
    } else {
      console.error(`Couldn't find or create scope for identifier: "${identifier}" and element:`, element)
    }
  }

  // Error handler delegate

  handleError(error: Error, message: string, detail: any) {
    this.application.handleError(error, message, detail)
  }

  // Scope observer delegate

  createScopeForElementAndIdentifier(element: Element, identifier: string) {
    return new Scope(this.schema, element, identifier, this.logger)
  }

  scopeConnected(scope: Scope) {
    if (this.movedScopes.has(scope)) {
      this.movedScopes.set(scope, true)
    }

    this.scopesByIdentifier.add(scope.identifier, scope)
    const module = this.modulesByIdentifier.get(scope.identifier)
    if (module) {
      module.connectContextForScope(scope)
    }
  }

  scopeDisconnected(scope: Scope) {
    if (this.scopeWasMoved(scope)) {
      this.keepScopeUntilMutationsAreProcessed(scope)
    } else {
      this.movedScopes.delete(scope)
      this.disconnectScope(scope)
    }
  }

  private disconnectScope(scope: Scope) {
    this.scopesByIdentifier.delete(scope.identifier, scope)
    const module = this.modulesByIdentifier.get(scope.identifier)
    if (module) {
      module.disconnectContextForScope(scope)
    }
  }

  // Permanent elements

  // A scope is reported as disconnected when its element is removed, even if the element is
  // back in the document by the time the removal is processed. Inside a permanent element
  // that is a move, and the controller stays connected.
  private scopeWasMoved({ element, identifier }: Scope) {
    return (
      this.elementIsPermanent(element) &&
      element.isConnected == this.element.isConnected &&
      this.element.contains(element) &&
      this.identifiersOf(element).includes(identifier)
    )
  }

  private identifiersOf(element: Element) {
    return (element.getAttribute(this.controllerAttribute) || "").trim().split(/\s+/)
  }

  private elementIsPermanent(element: Element) {
    const { permanentAttribute } = this.schema

    for (let ancestor: Element | null = element; permanentAttribute && ancestor; ancestor = ancestor.parentElement) {
      if (ancestor.hasAttribute(permanentAttribute)) return true
    }

    return false
  }

  // The insertion that completes a move reports the scope as connected again. Callbacks that
  // run in between can still take the element away or move it again, so the outcome is
  // settled once the pending mutations have been processed.
  private keepScopeUntilMutationsAreProcessed(scope: Scope) {
    if (this.movedScopes.size == 0) {
      Promise.resolve().then(() => this.settleMovedScopes())
    }

    this.movedScopes.set(scope, false)
  }

  // A scope that was not reported connected again is disconnected, wherever its element is
  // by now: if a callback moved it once more, processing that insertion reconnects it.
  private settleMovedScopes() {
    const movedScopes = Array.from(this.movedScopes)
    const keptScopes: Scope[] = []
    this.movedScopes.clear()

    for (const [scope, reconnected] of movedScopes) {
      if (reconnected) {
        keptScopes.push(scope)
      } else {
        this.disconnectScope(scope)
      }
    }

    this.refreshOutletsFor(keptScopes)
  }

  // Reconnecting a controller starts its outlet observers and refreshes the outlets that
  // select it. A kept controller does not reconnect, so both are refreshed here.
  private refreshOutletsFor(scopes: Scope[]) {
    const identifiers = new Set(scopes.map((scope) => scope.identifier))
    const contexts = new Set<Context>()

    for (const { element, identifier } of scopes) {
      const context = this.getContextForElementAndIdentifier(element, identifier)
      if (context) contexts.add(context)
    }

    for (const module of this.modules) {
      const outlets = readInheritableStaticArrayValues(module.controllerConstructor, "outlets")

      if (outlets.some((outlet) => identifiers.has(outlet))) {
        module.contexts.forEach((context) => contexts.add(context))
      }
    }

    contexts.forEach((context) => {
      try {
        context.refresh()
      } catch (error: any) {
        this.handleError(error, "Error refreshing outlets", {
          identifier: context.identifier,
          element: context.element,
        })
      }
    })
  }

  // Modules

  private connectModule(module: Module) {
    this.modulesByIdentifier.set(module.identifier, module)
    const scopes = this.scopesByIdentifier.getValuesForKey(module.identifier)
    scopes.forEach((scope) => {
      // A moved scope that has not been reported connected again may have left the document
      if (this.movedScopes.get(scope) !== false) {
        module.connectContextForScope(scope)
      }
    })
  }

  private disconnectModule(module: Module) {
    this.modulesByIdentifier.delete(module.identifier)
    const scopes = this.scopesByIdentifier.getValuesForKey(module.identifier)
    scopes.forEach((scope) => module.disconnectContextForScope(scope))
  }
}
