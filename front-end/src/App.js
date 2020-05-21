import React from 'react';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import {Button, Form, Container, Row, Col} from 'react-bootstrap';

function App(props) {

  const redirectUrl = props.query();

  return (
    <div className="App">
      <header className="App-header">
        <p>maple</p>
        <p>IDMG : abcd1234</p>
        <Authentifier redirectUrl={redirectUrl} />
      </header>
    </div>
  );
}

class Authentifier extends React.Component {

  state = {
    nomUsager: '',
    attendreVerificationUsager: false,
    usagerVerifie: false,
  }

  componentDidMount() {
    console.debug("Chargement component")

    // Verifier si on a un nom d'usager dans local storage
  }

  boutonUsagerSuivant = (event) => {
    console.debug("Authentifier")
    this.setState({usagerVerifie: true})  // TODO: Faire une vraie verif
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
      formulaire = <AuthentifierUsager nomUsager={this.state.nomUsager} redirectUrl={this.props.redirectUrl} />
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
  }

  changerMotdepasse = event => {
    const {value} = event.currentTarget;
    this.setState({motdepasse: value})
  }

  componentDidMount() {
    // console.debug("Redirect url : " + this.props.redirectUrl)
  }

  render() {
    return (
      <Form method="post" action="/authentification/ouvrir">

        <Form.Group controlId="formMotdepasse">
          <Form.Label>Mot de passe</Form.Label>
          <Form.Control
            type="password"
            name="password"
            value={this.state.motdepasse}
            onChange={this.changerMotdepasse}
            placeholder="Saisir votre mot de passe" />
        </Form.Group>

        <Form.Control type="hidden" name="url" value={this.props.redirectUrl} />

        <Button type="submit">Suivant</Button>

      </Form>
    )
  }

}

export default App;
