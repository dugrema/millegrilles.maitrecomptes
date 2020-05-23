import React from 'react'
import {Button, Form, Container, Row, Col} from 'react-bootstrap'
import {createHash} from 'crypto'
import axios from 'axios'
import {solveRegistrationChallenge} from '@webauthn/client'

import {NouveauMotdepasse} from './Authentification'

export class ChangerMotdepasse extends React.Component {

  state = {
    motdepasseActuel: '',
    motdepasseActuelHash: '',
  }

  changerMotdepasseActuel = event => {
    var {value} = event.currentTarget
    var motdepasseActuelHash = createHash('sha256').update(value, 'utf-8').digest('base64')
    this.setState({motdepasseActuel: value, motdepasseActuelHash})
  }

  formSubmit = event => {
    console.debug("Submit!")
    // event.preventDefault()
    // event.stopPropagation()

    const {form} = event.currentTarget
    console.debug(form)

    const requete = {
      motdepasseActuelHash: this.state.motdepasseActuelHash,
      motdepasseNouveau: form['motdepasse-hash'].value
    }

    console.debug("Requete")
    console.debug(requete)

    axios.post('/apps/changerMotdepasse', requete)
    .then(reponse=>{
      console.debug(reponse)
    })
    .catch(err=>{
      console.error("Erreur changement mot de passe")
      console.error(err)
    })

  }

  render() {
    return (
      <Container>
        <p>Changer mot de passe</p>

        <Form>
          <Form.Control type="text" name="nom-usager" autoComplete="username"
            defaultValue={this.props.nomUsagerAuthentifie} className="champ-cache"/>

          <Form.Group controlId="formMotdepasseActuel">
            <Form.Label>Mot de passe actuel</Form.Label>
            <Form.Control
              type="password"
              name="motdepasse-actuel"
              value={this.state.motdepasseActuel}
              autoComplete="current-password"
              onChange={this.changerMotdepasseActuel}
              placeholder="Saisir votre mot de passe actuel" />
          </Form.Group>

          <NouveauMotdepasse {...this.props} submit={this.formSubmit} />
        </Form>

        <Button onClick={this.props.revenir}>Retour</Button>

      </Container>
    )
  }
}

export function AjouterU2f(props) {

  return (
    <Container>
      <p>Ajouter un token U2F a votre compte.</p>

      <Button onClick={ajouterTokenU2f}>Ajouter</Button>
      <Button onClick={props.revenir}>Retour</Button>
    </Container>
  )
}

function ajouterTokenU2f() {
  var challengeId = null;
  axios.post('/apps/challengeRegistrationU2f')
  .then(response=>{
    console.debug("Response registration challenge")
    console.debug(response)

    challengeId = response.data.challengeId
    const authRequest = response.data.registrationRequest
    return solveRegistrationChallenge(authRequest)
  })
  .then(credentials=>{
    console.debug("Credentials")
    console.debug(credentials)
    return axios.post('/apps/ajouterU2f', {challengeId, credentials})
  })
  .then(response=>{
    console.debug("Response ajout token")
    console.debug(response)
  })
  .catch(err=>{
    console.error("Erreur registration challenge U2F")
    console.error(err)
  })
}
