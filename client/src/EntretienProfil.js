import React from 'react'
import {Button, Form, Container, Row, Col, Nav} from 'react-bootstrap'
import {createHash} from 'crypto'
import axios from 'axios'
import {solveRegistrationChallenge} from '@webauthn/client'

import {NouveauMotdepasse} from './Authentification'

export class ActionsProfil extends React.Component {

  state = {
    page: '',
  }

  setPage = page => {
    this.setState({page: MAP_PAGES[page]})
  }

  revenir = event => {
    this.setState({page: ''})
  }

  render() {
    var Page = this.state.page;
    if(!Page) Page = PageActions

    return <Page {...this.props} revenir={this.revenir} revenirParent={this.props.revenir} setPage={this.setPage} />
  }
}

function PageActions(props) {
  return (
    <Container>
      <Nav className="flex-column" onSelect={props.setPage}>
        <Nav.Link eventKey='AjouterMotdepasse'>Ajouter mot de passe</Nav.Link>
        <Nav.Link eventKey='ChangerMotdepasse'>Changer mot de passe</Nav.Link>
        <Nav.Link eventKey='AjouterU2f'>Ajouter token U2F</Nav.Link>
        <Nav.Link eventKey='Desactiver'>Desactivation de methodes d'authentification</Nav.Link>
        <Nav.Link onClick={props.revenirParent}>Retour</Nav.Link>
      </Nav>
    </Container>
  )
}

class ChangerMotdepasse extends React.Component {

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
    // event.preventDefault()
    // event.stopPropagation()

    const {form} = event.currentTarget
    console.debug(form)

    const requete = {
      motdepasseActuelHash: this.state.motdepasseActuelHash,
      motdepasseNouveau: form['motdepasse-hash'].value
    }

    // console.debug("Requete")
    // console.debug(requete)

    axios.post(this.props.apiUrl + '/changerMotdepasse', requete)
    .then(reponse=>{
      // console.debug(reponse)
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

class AjouterMotdepasse extends React.Component {

  formSubmit = event => {
    const {form} = event.currentTarget
    // console.debug(form)

    const requete = {
      motdepasseNouveau: form['motdepasse-hash'].value,
      'nom-usager': form['nom-usager'].value,
    }

    // console.debug("Requete")
    // console.debug(requete)

    axios.post(this.props.apiUrl + '/ajouterMotdepasse', requete)
    .then(reponse=>{
      // console.debug(reponse)
    })
    .catch(err=>{
      console.error("Erreur ajout mot de passe")
      console.error(err)
    })

  }

  render() {
    var classChampUsager = this.props.rootProps.estProprietaire?'':'champ-cache'

    return (
      <Container>
        <p>Ajouter un mot de passe</p>

        <Form>
          <Form.Group controlId="formNomUsager" className={classChampUsager}>
            <Form.Label>Nom d'usager</Form.Label>
            <Form.Control type="text" name="nom-usager" autoComplete="username"
              defaultValue={this.props.rootProps.nomUsager} />
          </Form.Group>

          <NouveauMotdepasse {...this.props} submit={this.formSubmit} />
        </Form>

        <Button onClick={this.props.revenir}>Retour</Button>

      </Container>
    )
  }
}

function AjouterU2f(props) {

  return (
    <Container>
      <Form onSubmit={ajouterTokenU2f} action={props.apiUrl}>
        <p>Ajouter un token U2F a votre compte.</p>

        <Form.Group controlId="formDesactiverAutresCles">
          <Form.Check type="checkbox" name="desactiverAutres" label="Desactiver toutes les autres cles existantes" />
        </Form.Group>

        <Button type="submit">Ajouter</Button>
        <Button onClick={props.revenir}>Retour</Button>
      </Form>
    </Container>
  )
}

function ajouterTokenU2f(event) {
  event.preventDefault()
  event.stopPropagation()

  const form = event.currentTarget
  const apiUrl = form.action
  console.debug("Form action : %s", apiUrl)

  const desactiverAutres = form.desactiverAutres.checked
  // console.debug(desactiverAutres)

  var challengeId = null;
  axios.post(apiUrl + '/challengeRegistrationU2f')
  .then(response=>{
    console.debug("Response registration challenge")
    console.debug(response)

    challengeId = response.data.challengeId
    const authRequest = response.data.registrationRequest
    return solveRegistrationChallenge(authRequest)
  })
  .then(credentials=>{
    // console.debug("Credentials")
    // console.debug(credentials)
    return axios.post(apiUrl + '/ajouterU2f', {challengeId, credentials, desactiverAutres})
  })
  .then(response=>{
    // console.debug("Response ajout token")
    // console.debug(response)
  })
  .catch(err=>{
    console.error("Erreur registration challenge U2F")
    console.error(err)
  })
}

function Desactiver(props) {
  return (
    <Container>
      <Row>
        <Col>
          <h2>Desactiver methode d'authentification</h2>
        </Col>
      </Row>

      <Row>
        <Col>
          <Button onClick={desactiverMotdepasse} data-apiurl={props.apiUrl}>Desactiver mot de passe</Button>
        </Col>
      </Row>

      <Row>
        <Col>
          <Button onClick={desactiverU2f} data-apiurl={props.apiUrl}>Desactiver U2F</Button>
        </Col>
      </Row>

      <Button onClick={props.revenir}>Retour</Button>
    </Container>
  )
}

function desactiverMotdepasse(event) {
  const {apiurl} = event.currentTarget.dataset
  axios.post(apiurl + '/desactiverMotdepasse')
  .then(reponse=>{
    // console.debug("Mot de passe desactive")
  })
  .catch(err=>{
    console.error("Erreur desactivation mot de passe")
    console.error(err)
  })
}

function desactiverU2f(event) {
  const {apiurl} = event.currentTarget.dataset
  axios.post(apiurl + '/desactiverU2f')
  .then(reponse=>{
    // console.debug("U2F desactive")
  })
  .catch(err=>{
    console.error("Erreur desactivation U2f")
    console.error(err)
  })
}

const MAP_PAGES = {
  ActionsProfil, ChangerMotdepasse, AjouterMotdepasse, AjouterU2f, Desactiver
}
