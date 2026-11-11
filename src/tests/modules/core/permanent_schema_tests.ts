import { LogControllerTestCase } from "../../cases/log_controller_test_case"
import { defaultSchema } from "../../../core/schema"

export default class PermanentSchemaTests extends LogControllerTestCase {
  schema = { ...defaultSchema, permanentAttribute: "data-turbo-permanent" }
  fixtureHTML = `
    <div id="custom" data-turbo-permanent data-controller="${this.identifier}"></div>
    <div id="default" data-stimulus-permanent data-controller="${this.identifier}"></div>
    <div id="elsewhere"></div>
  `

  async "test the schema names the attribute that makes an element permanent"() {
    const [custom, standard] = this.controllers

    this.findElement("#elsewhere").append(custom.element, standard.element)
    await this.nextFrame

    this.assert.deepEqual([custom.connectCount, custom.disconnectCount], [1, 0])
    this.assert.deepEqual([standard.connectCount, standard.disconnectCount], [2, 1])
  }
}
