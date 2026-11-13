import { LogControllerTestCase } from "../../cases/log_controller_test_case"

export default class PermanentElementTests extends LogControllerTestCase {
  fixtureHTML = `
    <div id="permanent" data-stimulus-permanent>
      <div id="controller" data-controller="${this.identifier}"></div>
    </div>
    <div id="elsewhere"></div>
  `

  async "test moving a permanent element keeps its controllers connected"() {
    const controller = this.controller

    this.elsewhereElement.appendChild(this.permanentElement)
    await this.nextFrame

    this.assert.equal(this.controller, controller)
    this.assertLifecycleCounts(1, 0)
  }

  async "test removing a permanent element and putting it back in the same task keeps its controllers connected"() {
    const { permanentElement } = this

    this.fixtureElement.removeChild(permanentElement)
    this.fixtureElement.appendChild(permanentElement)
    await this.nextFrame

    this.assertLifecycleCounts(1, 0)
  }

  async "test carrying a permanent element over from a replaced parent keeps its controllers connected"() {
    const { permanentElement } = this
    const oldParent = document.createElement("div")
    const newParent = document.createElement("div")
    this.fixtureElement.appendChild(oldParent)
    oldParent.appendChild(permanentElement)
    await this.nextFrame

    oldParent.replaceWith(newParent)
    newParent.appendChild(permanentElement)
    await this.nextFrame

    this.assertLifecycleCounts(1, 0)
  }

  async "test moving a controller element that is itself permanent keeps its controller connected"() {
    const { controllerElement } = this
    controllerElement.setAttribute("data-stimulus-permanent", "")
    this.permanentElement.removeAttribute("data-stimulus-permanent")
    await this.nextFrame

    this.elsewhereElement.appendChild(controllerElement)
    await this.nextFrame

    this.assertLifecycleCounts(1, 0)
  }

  async "test changing the order of identifiers in a permanent element keeps its controllers connected"() {
    this.controllerElement.setAttribute("data-controller", `other ${this.identifier}`)
    await this.nextFrame

    this.assertLifecycleCounts(1, 0)
  }

  async "test moving a controller element out of its permanent element reconnects its controller"() {
    this.elsewhereElement.appendChild(this.controllerElement)
    await this.nextFrame

    this.assertLifecycleCounts(2, 1)
  }

  async "test moving an element that is not permanent reconnects its controllers"() {
    const { permanentElement } = this
    permanentElement.removeAttribute("data-stimulus-permanent")
    await this.nextFrame

    this.elsewhereElement.appendChild(permanentElement)
    await this.nextFrame

    this.assertLifecycleCounts(2, 1)
  }

  async "test removing a permanent element disconnects its controllers"() {
    this.permanentElement.remove()
    await this.nextFrame

    this.assertLifecycleCounts(1, 1)
  }

  async "test putting a permanent element back in a later task reconnects its controllers"() {
    const { permanentElement } = this

    permanentElement.remove()
    await this.nextFrame
    this.fixtureElement.appendChild(permanentElement)
    await this.nextFrame

    this.assertLifecycleCounts(2, 1)
  }

  async "test moving a permanent element out of the application element disconnects its controllers"() {
    const { permanentElement } = this

    document.body.appendChild(permanentElement)
    await this.nextFrame

    this.assertLifecycleCounts(1, 1)

    permanentElement.remove()
  }

  async "test removing the identifier of a controller in a permanent element disconnects it"() {
    this.controllerElement.removeAttribute("data-controller")
    await this.nextFrame

    this.assertLifecycleCounts(1, 1)
  }

  assertLifecycleCounts(connectCount: number, disconnectCount: number) {
    this.assert.equal(this.loggedController.connectCount, connectCount, "connect() calls")
    this.assert.equal(this.loggedController.disconnectCount, disconnectCount, "disconnect() calls")
  }

  private loggedController = undefined as any

  async setup() {
    await super.setup()
    this.loggedController = this.controller
  }

  get permanentElement() {
    return this.findElement("#permanent")
  }

  get controllerElement() {
    return this.loggedController.element as Element
  }

  get elsewhereElement() {
    return this.findElement("#elsewhere")
  }
}
