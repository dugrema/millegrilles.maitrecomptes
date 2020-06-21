import React from 'react'
import {Button, Form, Container, Row, Col, Nav} from 'react-bootstrap'
import {createHash} from 'crypto'
import axios from 'axios'
import {solveRegistrationChallenge} from '@webauthn/client'

import Pki from './Pki'

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

  const options = []
  if(props.rootProps.estProprietaire) {
    options.push(<Nav.Link key='AjouterMotdepasse' eventKey='AjouterMotdepasse'>Ajouter mot de passe</Nav.Link>)
    options.push(<Nav.Link key='ChangerMotdepasse' eventKey='ChangerMotdepasse'>Changer mot de passe</Nav.Link>)
    options.push(<Nav.Link key='AjouterU2f' eventKey='AjouterU2f'>Ajouter token U2F</Nav.Link>)
    options.push(<Nav.Link key='Desactiver' eventKey='Desactiver'>Desactivation de methodes d'authentification</Nav.Link>)
  } else {
    options.push(<Nav.Link key='ChangerMotdepasse' eventKey='ChangerMotdepasse'>Changer mot de passe</Nav.Link>)
    options.push(<Nav.Link key='AjouterU2f' eventKey='AjouterU2fUsagerPrive'>Ajouter token U2F</Nav.Link>)
    options.push(<Nav.Link key='Desactiver' eventKey='Desactiver'>Desactivation de methodes d'authentification</Nav.Link>)
  }

  return (
    <Container>
      <Nav className="flex-column" onSelect={props.setPage}>
        {options}
        <Nav.Link onClick={props.revenirParent}>Retour</Nav.Link>
      </Nav>
    </Container>
  )
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

class ChangerMotdepasse extends React.Component {

  state = {
    motdepasseCourant: '',
    motdepasseNouveau1: '',
    motdepasseNouveau2: '',
    motdepasseMatch: false,

    motdepasseHash: '',
  }

  changerMotdepasse = event => {
    const {name, value} = event.currentTarget

    const maj = {
      [name]: value,
    }

    var nameAutre = null
    if(name === 'motdepasseNouveau1') nameAutre = 'motdepasseNouveau2'
    else if(name === 'motdepasseNouveau2') nameAutre = 'motdepasseNouveau1'
    if(nameAutre) {
      const motdepasseMatch = value === this.state[nameAutre];
      maj.motdepasseMatch = motdepasseMatch
    }

    this.setState(maj)
  }

  appliquerChangement = async event => {
    const motdepasse = this.state.motdepasse

    var motdepasseCourantHash = createHash('sha256').update(this.state.motdepasseCourant, 'utf-8').digest('base64').replace(/=/g, '')
    var motdepasseNouveauHash = createHash('sha256').update(this.state.motdepasseNouveau1, 'utf-8').digest('base64').replace(/=/g, '')

    const changement = {
      motdepasseCourantHash, motdepasseNouveauHash
    }

    console.debug("Changement mot de passe")
    console.debug(changement)

    this.props.rootProps.connexionSocketIo.emit('changerMotDePasse', changement, reponse => {
      if(reponse.resultat) {
        console.debug("Mot de passe change avec succes")
      } else {
        console.debug("Erreur changement mot de passe, echec")
      }
      this.props.revenir()
    })
  }

  render() {

    // name="" pour eviter de soumettre le mot de passe en clair
    return (
      <Container>
        <p>Changer mot de passe</p>

        <Form>
          <Form.Group controlId="formMotdepasseCourant">
            <Form.Label>Mot de passe courant</Form.Label>
            <Form.Control
              type="password"
              className="motdepasse"
              name="motdepasseCourant"
              value={this.state.motdepasseCourant}
              autoComplete="new-password"
              onChange={this.changerMotdepasse}
              placeholder="Mot de passe courant" />
          </Form.Group>

          <Form.Group controlId="formMotdepasseNouveau">
            <Form.Label>Nouveau mot de passe</Form.Label>
            <Form.Control
              type="password"
              className="motdepasse"
              name="motdepasseNouveau1"
              value={this.state.motdepasseNouveau1}
              autoComplete="new-password"
              onChange={this.changerMotdepasse}
              placeholder="Nouveau mot de passe" />
          </Form.Group>

          <Form.Group controlId="formMotdepasseNouveau2">
            <Form.Control
              type="password"
              className="motdepasse"
              name="motdepasseNouveau2"
              value={this.state.motdepasseNouveau2}
              autoComplete="new-password"
              onChange={this.changerMotdepasse}
              placeholder="Nouveau mot de passe" />
          </Form.Group>

          <Row>
            <Col className="button-list">
              <Button onClick={this.appliquerChangement}
                disabled={ ! this.state.motdepasseMatch }>Changer</Button>
              <Button onClick={this.props.annuler} variant="secondary">Annuler</Button>
            </Col>
          </Row>
        </Form>

        <Button onClick={this.props.revenir}>Retour</Button>

      </Container>
    )
  }
}


const MAP_PAGES = {
  ActionsProfil, ChangerMotdepasse, AjouterMotdepasse, AjouterU2f, Desactiver, Pki, ChangerMotdepasse
}
