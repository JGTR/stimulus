import { Controller } from "../../../core/controller"
import { ApplicationTestCase, TestApplication } from "../../cases/application_test_case"

class CountingController extends Controller {
  connectCount = 0
  disconnectCount = 0

  connect() {
    this.connectCount++
  }

  disconnect() {
    this.disconnectCount++
  }
}

class RemovingController extends Controller {
  disconnect() {
    document.getElementById("permanent")?.remove()
  }
}

class MovingController extends Controller {
  disconnect() {
    const element = document.getElementById("moved-again")
    if (element) document.getElementById("destination")?.append(element)
  }
}

class CallbackController extends Controller {
  disconnected?: () => void

  disconnect() {
    this.disconnected?.()
  }
}

class HostController extends Controller {
  static outlets = ["counting"]

  countingOutletElements!: Element[]
  connectedOutletElements: Element[] = []
  disconnectedOutletElements: Element[] = []

  countingOutletConnected(_outlet: Controller, element: Element) {
    this.connectedOutletElements.push(element)
  }

  countingOutletDisconnected(_outlet: Controller, element: Element) {
    this.disconnectedOutletElements.push(element)
  }
}

export default class PermanentElementBatchTests extends ApplicationTestCase {
  fixtureHTML = `
    <div id="items">
      <div id="permanent" data-stimulus-permanent data-controller="counting"></div>
      <div id="other" data-controller="counting"></div>
    </div>
    <div id="removing" data-controller="removing"></div>
    <div id="host" data-controller="host" data-host-counting-outlet="#items > :first-child"></div>
    <div id="moving-items">
      <div id="moved-again" data-stimulus-permanent data-controller="counting"></div>
      <div data-controller="moving"></div>
    </div>
    <div id="destination"></div>
    <div id="neighbours">
      <div id="neighbour-host" data-stimulus-permanent data-controller="host" data-host-counting-outlet="#neighbour-host + *"></div>
      <div id="first-neighbour" data-controller="counting"></div>
      <div id="second-neighbour" data-controller="counting"></div>
    </div>
    <div id="late-items">
      <div id="late" data-stimulus-permanent data-controller="late"></div>
    </div>
    <div id="callback" data-controller="callback"></div>
  `

  setupApplication() {
    this.application.register("counting", CountingController)
    this.application.register("removing", RemovingController)
    this.application.register("moving", MovingController)
    this.application.register("host", HostController)
    this.application.register("callback", CallbackController)
  }

  async "test a permanent element that a callback removes while it is being moved is disconnected"() {
    const permanentElement = this.findElement("#permanent")
    const controller = this.controllerFor(permanentElement, "counting") as CountingController

    permanentElement.remove()
    this.findElement("#removing").remove()
    this.findElement("#items").prepend(permanentElement)
    await this.nextFrame

    this.assert.notOk(permanentElement.isConnected)
    this.assert.deepEqual([controller.connectCount, controller.disconnectCount], [1, 1])
    this.assert.notOk(this.application.controllers.includes(controller))
  }

  async "test a permanent element that is moved, removed and put back later is reconnected"() {
    const permanentElement = this.findElement("#permanent")
    const controller = this.controllerFor(permanentElement, "counting") as CountingController

    permanentElement.remove()
    this.findElement("#removing").remove()
    this.findElement("#items").prepend(permanentElement)
    await this.nextFrame
    this.findElement("#items").prepend(permanentElement)
    await this.nextFrame

    this.assert.deepEqual([controller.connectCount, controller.disconnectCount], [2, 1])
    this.assert.ok(this.application.controllers.includes(controller))
  }

  async "test a permanent element that a callback moves again while it is being moved is reconnected"() {
    const permanentElement = this.findElement("#moved-again")
    const controller = this.controllerFor(permanentElement, "counting") as CountingController

    this.fixtureElement.append(this.findElement("#moving-items"))
    await this.nextFrame

    this.assert.equal(permanentElement.parentElement, this.findElement("#destination"))
    this.assert.deepEqual([controller.connectCount, controller.disconnectCount], [2, 1])
    this.assert.ok(this.application.controllers.includes(controller))
  }

  async "test a permanent element that a callback moves again and then removes is disconnected"() {
    const permanentElement = this.findElement("#moved-again")
    const controller = this.controllerFor(permanentElement, "counting") as CountingController

    this.fixtureElement.append(this.findElement("#moving-items"))
    Promise.resolve().then(() => Promise.resolve().then(() => permanentElement.remove()))
    await this.nextFrame

    this.assert.notOk(permanentElement.isConnected)
    this.assert.equal(controller.connectCount, controller.disconnectCount)
    this.assert.notOk(this.application.controllers.includes(controller))
  }

  async "test a permanent controller that is moved follows its own outlets"() {
    const hostElement = this.findElement("#neighbour-host")
    const firstNeighbour = this.findElement("#first-neighbour")
    const secondNeighbour = this.findElement("#second-neighbour")
    const host = this.controllerFor(hostElement, "host") as HostController
    this.assert.deepEqual(host.connectedOutletElements, [firstNeighbour])

    secondNeighbour.before(hostElement)
    await this.nextFrame

    this.assert.deepEqual(host.disconnectedOutletElements, [firstNeighbour])
    this.assert.deepEqual(host.connectedOutletElements, [firstNeighbour, secondNeighbour])
  }

  async "test outlets that select by position follow a permanent element that is moved"() {
    const permanentElement = this.findElement("#permanent")
    const otherElement = this.findElement("#other")
    const host = this.controllerFor(this.findElement("#host"), "host") as HostController
    const controller = this.controllerFor(permanentElement, "counting") as CountingController
    this.assert.deepEqual(host.countingOutletElements, [permanentElement])
    this.assert.deepEqual(host.connectedOutletElements, [permanentElement])

    this.findElement("#items").append(permanentElement)
    await this.nextFrame

    this.assert.deepEqual([controller.connectCount, controller.disconnectCount], [1, 0])
    this.assert.deepEqual(host.countingOutletElements, [otherElement])
    this.assert.deepEqual(host.disconnectedOutletElements, [permanentElement])
    this.assert.deepEqual(host.connectedOutletElements, [permanentElement, otherElement])
  }

  async "test moving an element with a malformed identifier does not stop the other mutations from being processed"() {
    const otherElement = this.findElement("#other")
    const controller = this.controllerFor(otherElement, "counting") as CountingController
    const malformedElement = document.createElement("div")
    malformedElement.setAttribute("data-controller", 'malformed"identifier')
    this.fixtureElement.append(malformedElement)
    await this.nextFrame

    this.findElement("#items").append(malformedElement)
    otherElement.remove()
    await this.nextFrame

    this.assert.deepEqual([controller.connectCount, controller.disconnectCount], [1, 1])
  }

  async "test registering a controller while its permanent element is being moved and then removed leaves it disconnected"() {
    const lateElement = this.findElement("#late")
    const lifecycle: string[] = []
    class LateController extends Controller {
      connect() {
        lifecycle.push("connect")
      }

      disconnect() {
        lifecycle.push("disconnect")
      }
    }
    this.callbackController.disconnected = () => {
      lateElement.remove()
      this.application.register("late", LateController)
    }

    lateElement.remove()
    this.findElement("#callback").remove()
    this.findElement("#late-items").append(lateElement)
    await this.nextFrame

    this.assert.notOk(lateElement.isConnected)
    this.assert.deepEqual(lifecycle, [])
    this.assert.notOk(this.controllerFor(lateElement, "late"))
  }

  async "test registering a controller after its permanent element was moved back connects it"() {
    const lateElement = this.findElement("#late")
    this.callbackController.disconnected = () => this.application.register("late", CountingController)

    lateElement.remove()
    this.findElement("#late-items").append(lateElement)
    this.findElement("#callback").remove()
    await this.nextFrame

    const controller = this.controllerFor(lateElement, "late") as CountingController
    this.assert.ok(controller)
    this.assert.deepEqual([controller.connectCount, controller.disconnectCount], [1, 0])
    this.assert.ok(this.application.controllers.includes(controller))
  }

  async "test registering a controller again after its permanent element was moved and removed leaves it disconnected"() {
    const permanentElement = this.findElement("#permanent")
    const otherElement = this.findElement("#other")

    permanentElement.remove()
    this.findElement("#removing").remove()
    this.findElement("#items").prepend(permanentElement)
    await this.nextFrame
    this.application.register("counting", CountingController)
    await this.nextFrame

    this.assert.notOk(permanentElement.isConnected)
    this.assert.notOk(this.controllerFor(permanentElement, "counting"))
    this.assert.notOk(this.application.controllers.some((controller) => controller.element == permanentElement))
    this.assert.ok(this.controllerFor(otherElement, "counting"))
  }

  async "test a permanent element that was moved before and is then removed by a callback while it is moved again is disconnected"() {
    const permanentElement = this.findElement("#permanent")
    const controller = this.controllerFor(permanentElement, "counting") as CountingController

    this.findElement("#items").append(permanentElement)
    await this.nextFrame
    permanentElement.remove()
    this.findElement("#removing").remove()
    this.findElement("#items").prepend(permanentElement)
    await this.nextFrame

    this.assert.notOk(permanentElement.isConnected)
    this.assert.deepEqual([controller.connectCount, controller.disconnectCount], [1, 1])
    this.assert.notOk(this.application.controllers.includes(controller))
  }

  async "test moving a permanent element inside a detached application element keeps its controllers connected"() {
    const rootElement = document.createElement("div")
    rootElement.innerHTML = `
      <div id="detached-permanent" data-stimulus-permanent data-controller="counting"></div>
      <div id="detached-destination"></div>
    `
    const permanentElement = rootElement.querySelector("#detached-permanent")!
    const application = new TestApplication(rootElement)
    application.register("counting", CountingController)

    try {
      await application.start()
      const controller = application.getControllerForElementAndIdentifier(
        permanentElement,
        "counting"
      ) as CountingController

      rootElement.querySelector("#detached-destination")!.append(permanentElement)
      await this.nextFrame

      this.assert.notOk(rootElement.isConnected)
      this.assert.deepEqual([controller.connectCount, controller.disconnectCount], [1, 0])
      this.assert.ok(application.controllers.includes(controller))
    } finally {
      application.stop()
    }
  }

  get callbackController() {
    return this.controllerFor(this.findElement("#callback"), "callback") as CallbackController
  }

  controllerFor(element: Element, identifier: string) {
    return this.application.getControllerForElementAndIdentifier(element, identifier)
  }
}
