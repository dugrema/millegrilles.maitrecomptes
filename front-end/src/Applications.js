import React from 'react'
import './App.css'
import {Button, Form, Container, Row, Col} from 'react-bootstrap'
import axios from 'axios'

export class Applications extends React.Component {

  state = {
    page: null,
  }

  revenir = event => {
    this.setState({page: null})
  }

  setPage = event => {
    const {value} = event.currentTarget
    // console.debug(event.currentTarget)
    // console.debug("Changement vers page : %s", value)
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
      <Button onClick={props.setPage} value='ChangerMotdepasse'>Changer mot de passe</Button>
      <Button href="/authentification/fermer">Fermer</Button>
    </Container>
  )
}

class ChangerMotdepasse extends React.Component {

  render() {
    return (
      <Container>
        <p>Changer mot de passe</p>
        <Button onClick={this.props.revenir}>Retour</Button>
      </Container>
    )
  }
}

const MAP_PAGES = {
  ChangerMotdepasse
}
