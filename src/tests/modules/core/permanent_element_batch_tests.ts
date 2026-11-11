import { Controller } from "../../../core/controller"
import { ApplicationTestCase } from "../../cases/application_test_case"

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
  `

  setupApplication() {
    this.application.register("counting", CountingController)
    this.application.register("removing", RemovingController)
    this.application.register("moving", MovingController)
    this.application.register("host", HostController)
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

    this.findElement("#items").append(permanentElement)
    await this.nextFrame

    this.assert.deepEqual([controller.connectCount, controller.disconnectCount], [1, 0])
    this.assert.deepEqual(host.countingOutletElements, [otherElement])
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

  controllerFor(element: Element, identifier: string) {
    return this.application.getControllerForElementAndIdentifier(element, identifier)
  }
}
