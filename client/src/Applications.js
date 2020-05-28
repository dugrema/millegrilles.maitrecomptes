import React from 'react'
import './App.css'
import {Button, Container} from 'react-bootstrap'

import { ActionsProfil } from './EntretienProfil'

const MAP_PAGES = {
  ActionsProfil
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

    return <Page {...this.props} revenir={this.revenir} setPage={this.setPage} />
  }
}

function Accueil(props) {

  return (
    <Container>
      <Button onClick={props.setPage} value='ActionsProfil'>Profil</Button>
      <Button href={props.authUrl + "/fermer"}>Fermer</Button>
    </Container>
  )
}
