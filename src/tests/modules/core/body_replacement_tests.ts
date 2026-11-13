import { Application } from "../../../core/application"
import { Controller } from "../../../core/controller"
import { DOMTestCase } from "../../cases/dom_test_case"

class HostController extends Controller {
  static outlets = ["item"]

  itemOutletElements!: Element[]
  connectCount = 0
  disconnectCount = 0
  connectedItems: Element[] = []
  disconnectedItems: Element[] = []

  connect() {
    this.connectCount++
  }

  disconnect() {
    this.disconnectCount++
  }

  itemOutletConnected(_outlet: Controller, element: Element) {
    this.connectedItems.push(element)
  }

  itemOutletDisconnected(_outlet: Controller, element: Element) {
    this.disconnectedItems.push(element)
  }
}

export default class BodyReplacementTests extends DOMTestCase {
  async "test a controller carried over into a new body stays connected and follows the outlets there"() {
    const application = new Application(document.documentElement)
    application.register("host", HostController)
    application.register("item", Controller)

    const oldBody = document.body
    const newBody = document.createElement("body")
    const host = this.createElement(
      `<div data-controller="host" data-host-item-outlet=".item" data-stimulus-permanent>`
    )
    const oldItem = this.createElement(`<div class="item" data-controller="item">`)
    const newItem = this.createElement(`<div class="item" data-controller="item">`)
    const laterItem = this.createElement(`<div class="item" data-controller="item">`)
    oldBody.append(host, oldItem)
    newBody.append(newItem)

    try {
      await application.start()
      await this.nextFrame
      const controller = application.getControllerForElementAndIdentifier(host, "host") as HostController
      this.assert.deepEqual(controller.connectedItems, [oldItem])

      oldBody.replaceWith(newBody)
      newBody.append(host)
      await this.nextFrame

      this.assert.deepEqual([controller.connectCount, controller.disconnectCount], [1, 0])
      this.assert.deepEqual(controller.disconnectedItems, [oldItem])
      this.assert.deepEqual(controller.connectedItems, [oldItem, newItem])
      this.assert.deepEqual(controller.itemOutletElements, [newItem])

      newBody.append(laterItem)
      await this.nextFrame

      this.assert.deepEqual(controller.connectedItems, [oldItem, newItem, laterItem])
    } finally {
      application.stop()
      newBody.replaceWith(oldBody)
      host.remove()
      oldItem.remove()
    }
  }

  async "test the document element is not an outlet, as it is not for the outlet properties"() {
    const application = new Application(document.documentElement)
    application.register("host", HostController)
    application.register("item", Controller)

    const host = this.createElement(`<div data-controller="host" data-host-item-outlet="html">`)
    document.documentElement.setAttribute("data-controller", "item")
    document.body.append(host)

    try {
      await application.start()
      await this.nextFrame
      const controller = application.getControllerForElementAndIdentifier(host, "host") as HostController

      this.assert.deepEqual(controller.connectedItems, [])
      this.assert.deepEqual(controller.itemOutletElements, [])
    } finally {
      application.stop()
      host.remove()
      document.documentElement.removeAttribute("data-controller")
    }
  }

  createElement(html: string) {
    const template = document.createElement("template")
    template.innerHTML = html
    return template.content.firstElementChild as Element
  }
}
