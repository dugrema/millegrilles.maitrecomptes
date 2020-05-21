import React from 'react'
import './App.css'
import 'bootstrap/dist/css/bootstrap.min.css'
import {Button, Form, Container, Row, Col} from 'react-bootstrap'
import axios from 'axios'
import {createHash} from 'crypto'

export class Authentifier extends React.Component {

  state = {
    nomUsager: '',
    attendreVerificationUsager: false,
    usagerVerifie: false,
    etatUsager: '',
  }

  componentDidMount() {
    console.debug("Chargement component")

    // Verifier si on a un nom d'usager dans local storage
    axios.get('/authentification/verifier')
    .then(reponse =>{
      console.debug("Reponse verification cookie session")
      console.debug(reponse)

      // Conserver le nom de l'usager, redirige vers la liste des applications disponibles
      const nomUsager = reponse.headers['user-prive']
      this.props.setNomUsagerAuthentifie(nomUsager)
    })
    .catch(err=>{
      const statusCode = err.response.status
      if(statusCode === 401) {
        console.debug("Usager non authentifie")
      } else {
        console.error("Erreur verification cookie session, status code %s", statusCode)
        console.error(err)
      }
    })
  }

  boutonUsagerSuivant = (event) => {
    console.debug("Authentifier")
    this.setState({usagerVerifie: true})  // TODO: Faire une vraie verif

    axios.post('/authentification/verifierUsager', 'nom-usager='+this.state.nomUsager)
    .then(response=>{
      this.setState({etatUsager: 'connu'})
    })
    .catch(err=>{
      const statusCode = err.response.status
      if(statusCode === 401) {
        console.debug("Usager inconnu")
        this.setState({etatUsager: 'inconnu'})
      } else {
        console.error("Erreur verification usager")
        console.error(err);
      }
    })

  }

  changerNomUsager = (event) => {
    const {value} = event.currentTarget
    this.setState({nomUsager: value})
  }

  render() {

    let formulaire;
    if(!this.state.usagerVerifie) {
      formulaire = <SaisirUsager boutonUsagerSuivant={this.boutonUsagerSuivant} changerNomUsager={this.changerNomUsager} nomUsager={this.state.nomUsager} />
    } else {
      if(this.state.etatUsager === 'connu') {
        formulaire = <AuthentifierUsager nomUsager={this.state.nomUsager} redirectUrl={this.props.redirectUrl} />
      } else if (this.state.etatUsager === 'inconnu') {
        formulaire = <InscrireUsager nomUsager={this.state.nomUsager} redirectUrl={this.props.redirectUrl} />
      } else {
        formulaire = <AttendreVerificationUsager />
      }
    }

    return (
      <Container>
        <Row>
          <Col sm={2} md={3}></Col>
          <Col sm={8} md={6}>
            {formulaire}
          </Col>
          <Col sm={2} md={3}></Col>
        </Row>
      </Container>
    )

  }
}

function AttendreVerificationUsager() {
  return (
    <p>Attendre verification de votre nom d'usager</p>
  )
}

function SaisirUsager(props) {
  return (
    <Form>
      <Form.Group controlId="formNomUsager">
        <Form.Label>Nom d'usager</Form.Label>
        <Form.Control
          type="email"
          placeholder="Saisissez votre nom d'usager ici"
          value={props.nomUsager}
          onChange={props.changerNomUsager} />
        <Form.Text className="text-muted">
            Si vous voulez creer un nouveau compte, entrez votre nom d'usager desire et cliquez sur Suivant.
        </Form.Text>
      </Form.Group>

      <Button onClick={props.boutonUsagerSuivant}>Suivant</Button>
    </Form>
  )
}

class AuthentifierUsager extends React.Component {

  state = {
    motdepasse: '',
    motdepasseHash: '',
  }

  changerMotdepasse = event => {
    const {value} = event.currentTarget;

    var motdepasseHash = createHash('sha256').update(value, 'utf-8').digest('base64')

    this.setState({
      motdepasse: value,
      motdepasseHash,
    })
  }

  componentDidMount() {
    // console.debug("Redirect url : " + this.props.redirectUrl)
  }

  render() {

    // Set params hidden : nom usager, url redirection au besoin
    const hiddenParams = [
      <Form.Control key="nomUsager" type="hidden" name="nom-usager" value={this.props.nomUsager} />,
      <Form.Control key="motdepasseHash" type="hidden" name="motdepasse-hash" value={this.state.motdepasseHash} />,
    ]
    if(this.props.redirectUrl) {
      hiddenParams.push(<Form.Control key="redirectUrl" type="hidden" name="url" value={this.props.redirectUrl} />)
    }

    return (
      <Form method="post" action="/authentification/ouvrir">

        <p>Usager : {this.props.nomUsager}</p>

        <Form.Group controlId="formMotdepasse">
          <Form.Label>Mot de passe</Form.Label>
          <Form.Control
            type="password"
            name="motdepasse"
            value={this.state.motdepasse}
            onChange={this.changerMotdepasse}
            placeholder="Saisir votre mot de passe" />
        </Form.Group>

        {hiddenParams}

        <Button type="submit">Suivant</Button>

      </Form>
    )
  }

}

class InscrireUsager extends React.Component {

  state = {
    motdepasse: '',
    motdepasse2: '',
    motdepasseHash: '',
  }

  changerMotdepasse = event => {
    const {value} = event.currentTarget

    var motdepasseHash = createHash('sha256').update(value, 'utf-8').digest('base64')

    this.setState({
      motdepasse: value,
      motdepasseHash,
    })

  }

  changerMotdepasse2 = event => {
    const {value} = event.currentTarget;
    this.setState({motdepasse2: value})
  }

  componentDidMount() {
    // console.debug("Redirect url : " + this.props.redirectUrl)

    console.debug("Salt : %s, iterations : %s", this.state.salt, this.state.iterations)
  }

  render() {

    // Set params hidden : nom usager, url redirection au besoin
    const hiddenParams = [
      <Form.Control key="nomUsager" type="hidden" name="nom-usager" value={this.props.nomUsager} />,
      <Form.Control key="motdepasseHash" type="hidden" name="motdepasse-hash" value={this.state.motdepasseHash} />,
    ]
    if(this.props.redirectUrl) {
      hiddenParams.push(<Form.Control key="redirectUrl" type="hidden" name="url" value={this.props.redirectUrl} />)
    }

    return (
      <Form method="post" action="/authentification/inscrire">

        <p>Creer un nouveau compte sur cette MilleGrille</p>
        <p>Usager : {this.props.nomUsager}</p>

        <Form.Group controlId="formMotdepasse">
          <Form.Label>Mot de passe</Form.Label>
          <Form.Control
            type="password"
            name="motdepasse"
            value={this.state.motdepasse}
            onChange={this.changerMotdepasse}
            placeholder="Saisir votre mot de passe" />
          <Form.Control
            type="password"
            name="motdepasse2"
            value={this.state.motdepasse2}
            onChange={this.changerMotdepasse2}
            placeholder="Saisir votre mot de passe a nouveau" />
        </Form.Group>

        {hiddenParams}

        <Button type="submit">Inscrire</Button>

      </Form>
    )
  }

}
