import React from 'react'
import './App.css'
import {Button, Form, Container, Row, Col} from 'react-bootstrap'
import axios from 'axios'

import {ChangerMotdepasse, AjouterU2f, AjouterMotdepasse, desactiverMotdepasse} from './EntretienProfil'

const MAP_PAGES = {
  ChangerMotdepasse, AjouterU2f, AjouterMotdepasse
}

export class Applications extends React.Component {

  state = {
    page: null,
  }

  revenir = event => {
    this.setState({page: null})
  }

  setPage = event => {
    const {value} = event.currentTarget
    this.setState({page: MAP_PAGES[value]})
  }

  render() {

    var Page = this.state.page;
    if(!Page) Page = Accueil

    return <Page {...this.props} revenir={this.revenir} setPage={this.setPage}/>
  }
}

function Accueil(props) {
  return (
    <Container>
      <p>Authentifie en tant que {props.nomUsagerAuthentifie}, liste apps</p>
      <Button onClick={props.setPage} value='AjouterMotdepasse'>Ajouter mot de passe</Button>
      <Button onClick={props.setPage} value='ChangerMotdepasse'>Changer mot de passe</Button>
      <Button onClick={desactiverMotdepasse}>Desactiver mot de passe</Button>
      <Button onClick={props.setPage} value='AjouterU2f'>Ajouter token U2F</Button>
      <Button href="/authentification/fermer">Fermer</Button>
    </Container>
  )
}
