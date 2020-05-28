import React from 'react'
import './App.css'
import {Button, Container, Nav} from 'react-bootstrap'
import path from 'path'
import axios from 'axios'

import { ActionsProfil } from './EntretienProfil'

const MAP_PAGES = {
  ActionsProfil
}

export class Applications extends React.Component {

  state = {
    page: null,
    applications: [],
  }

  revenir = event => {
    this.setState({page: null})
  }

  setPage = event => {
    const {value} = event.currentTarget
    this.setState({page: MAP_PAGES[value]})
  }

  componentDidMount() {
    const urlInfo = path.join('millegrilles', 'api', 'applications.json')
    axios.get(urlInfo)
    .then(response=>{
      console.debug(response)
      const listeApplications = response.data

      // Trier liste

      this.setState({
        applications: listeApplications
      })
    })
    .catch(err=>{
      console.error("Erreur acces site")
    })
  }

  render() {

    var Page = this.state.page;
    if(!Page) Page = Accueil

    return <Page {...this.props} revenir={this.revenir} setPage={this.setPage} applications={this.state.applications}/>
  }
}

function Accueil(props) {

  return (
    <Container>
      <Button onClick={props.setPage} value='ActionsProfil'>Profil</Button>
      <Button href={props.authUrl + "/fermer"}>Fermer</Button>

      <ListeApplications applications={props.applications} />
    </Container>
  )
}

function ListeApplications(props) {

  var renderedList = props.applications.map(app=>{
    return (
      <Nav.Link key={app.url} href={app.url}>{app.nomFormatte}</Nav.Link>
    )
  })

  return (
    <Nav className="flex-column" onSelect={props.setPage}>
      {renderedList}
    </Nav>
  )

}
