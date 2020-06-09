import React from 'react'
import './App.css'
import {Button, Container, Nav} from 'react-bootstrap'
import path from 'path'
import axios from 'axios'

import { ActionsProfil } from './EntretienProfil'
import { ActionsFederees } from './Federation'

const MAP_PAGES = {
  ActionsProfil, ActionsFederees
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
    this.props.chargerCertificats()

    const urlInfo = path.join('/millegrilles', 'api', 'applications.json')
    axios.get(urlInfo)
    .then(response=>{
      // console.debug(response)
      const listeApplications = response.data

      // Trier liste
      this.props.setMenuApplications(listeApplications)

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
      <div className="button-list">
        <Button onClick={props.setPage} value='ActionsProfil' variant="secondary">Profil</Button>
        <Button onClick={props.setPage} value='ActionsFederees' variant="secondary">Federation</Button>
        <Button href={props.authUrl + "/fermer"} variant="secondary">Fermer</Button>
      </div>

      <h2>Applications</h2>
      <Nav className="flex-column" onSelect={props.setPage}>
        <ListeApplications applications={props.applications} />
      </Nav>

    </Container>
  )
}

function ListeApplications(props) {

  var renderedList = props.applications.map(app=>{
    return (
      <Nav.Link key={app.url} href={app.url}>{app.nomFormatte}</Nav.Link>
    )
  })

  return renderedList

}
