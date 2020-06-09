import React from 'react'
import { Form, InputGroup, Row, Col, Button } from 'react-bootstrap'
import axios from 'axios'
import path from 'path'
import {v4 as uuidv4} from 'uuid'
import stringify from 'json-stable-stringify'

import { signerContenuString, chargerClePrivee } from 'millegrilles.common/lib/forgecommon'

export class ActionsFederees extends React.Component {

  render() {
    return (
      <div>
        <Row>
          <Col>
            <h2>Actions federees</h2>
          </Col>
        </Row>

        <Row>
          <Col>
            IDMG :
          </Col>
        </Row>

        <OuvertureFederee rootProps={this.props.rootProps}/>

        <Button onClick={this.props.revenir} variant="secondary">Retour</Button>

      </div>
    )
  }

}

class OuvertureFederee extends React.Component {
  state = {
    url: '',
    messageJson: '',
  }

  changerUrl = event => {
    const url = event.currentTarget.value
    this.setState({url})
  }

  ouverture = async event => {
    event.preventDefault()
    event.stopPropagation()
    const form = event.currentTarget

    const url = this.state.url + '/millegrilles/authentification/challengeFedere'
    try {
      const challengeId = uuidv4()
      const reponse = await axios.post(url, "&challenge=" + challengeId)
      const reponseServeur = reponse.data
      console.debug("Reponse")
      console.debug(reponse)

      const idmgs = {}
      for(let idmg in this.props.rootProps.certificats) {
        const infoIdmg = this.props.rootProps.certificats[idmg]
        console.debug("Certs pour idmg %s", idmg)
        console.debug(infoIdmg)
        idmgs[idmg] = infoIdmg.chaineCertificats
      }

      const messageJson = {
        challengeId: reponseServeur.challengeId,
        idmgs,
      }
      const messageJsonStringify = stringify(messageJson)

      const signatures = {}
      for(let idmg in this.props.rootProps.certificats) {
        const infoIdmg = this.props.rootProps.certificats[idmg]
        const clePriveePEM = infoIdmg.cle
        const clePrivee = chargerClePrivee(clePriveePEM)
        const signature = signerContenuString(clePrivee, messageJsonStringify)
        signatures[idmg] = signature
      }
      messageJson['_signatures'] = signatures

      console.debug("Message a transmettre")
      console.debug(messageJson)

      this.setState({
        messageJson: stringify(messageJson),
      }, ()=>{form.submit()})
    } catch(err) {
      console.error("Erreur")
      console.error(err)
    }
  }

  render() {
    return (
      <Form onSubmit={this.ouverture} method="post" action={this.state.url + '/millegrilles/authentification/ouvrir'}>
        <Form.Group controlId="formUrl">
          <Form.Control key="federe" type="hidden" name="federe" value="true" />
          <Form.Control key="certificat-client-json" type="hidden"
            name="certificat-client-json" value={this.state.messageJson} />
          <InputGroup>
            <InputGroup.Prepend><InputGroup.Text>URL</InputGroup.Text></InputGroup.Prepend>
            <Form.Control
              type="text"
              placeholder="https://www.millegrilles.com"
              value={this.state.url}
              onChange={this.changerUrl} />
            <InputGroup.Append>
              <Button type="submit" variant="dark">GO</Button>
            </InputGroup.Append>
          </InputGroup>
          <Form.Text className="text-muted">
              Entrez le site web de la MilleGrille ou vous voulez vous connecter
          </Form.Text>
        </Form.Group>
      </Form>
    )
  }
}
