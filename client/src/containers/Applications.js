import React from 'react'
import './App.css'
import {Button, Container, Nav} from 'react-bootstrap'
import path from 'path'
import axios from 'axios'

import { ActionsProfil } from './EntretienProfil'
import { MotsDePasse } from './MotsDePasse'

// Importer dependances inclues dans ce build
import { MAPPING_DEPENDANCES } from '../mappingDependances'

const MAP_PAGES = {
  ActionsProfil, MotsDePasse
}

var MAP_APPLICATIONS = {}

export class Applications extends React.Component {

  state = {
    applicationsExternes: [],
  }

  revenir = event => {
    this.props.goHome()
  }

  setPage = event => {
    const {value} = event.currentTarget
    // console.debug("Set page : %s", value)
    this.props.setPage(MAP_PAGES[value])
  }

  setApplication = async application => {
    // console.debug("Set application : %s", application)

    const appMapping = MAP_APPLICATIONS[application]
    if(!appMapping) {
      // Lien externe
      return
    }

    var app = null
    if(appMapping.dom) {
      app = appMapping.dom
    } else if(appMapping.load) {
      app = await appMapping.load()
    }
    this.props.setApplication(app)
  }

  componentDidMount() {
    this.props.connecterSocketIo(this.props)

    const urlInfo = path.join('/millegrilles', 'api', 'applications.json')
    axios.get(urlInfo)
    .then(response=>{
      // console.debug(response)
      const listeApplications = response.data

      // Trier liste
      // this.props.setMenuApplications(listeApplications)

      this.setState({
        applicationsExternes: listeApplications
      })
    })
    .catch(err=>{
      console.error("Erreur acces site")
    })
  }

  render() {

    var Page = this.props.page
    if( ! Page ) Page = Accueil

    return <Page
              {...this.props}
              revenir={this.props.goHome}
              setPage={this.setPage}
              setApplication={this.setApplication}
              applicationsExternes={this.state.applicationsExternes} />
  }
}

function Accueil(props) {

  return (
    <Container>
      <div className="button-list">
        <Button onClick={props.setPage} value='ActionsProfil' disabled={!props.rootProps.modeProtege} variant="secondary">Profil</Button>
        <Button href={props.authUrl + "/fermer"} variant="secondary">Fermer</Button>
      </div>

      <h2>Applications</h2>
      <Nav className="flex-column" onSelect={props.setApplication}>
        <ListeApplications
          applicationsExternes={props.applicationsExternes} />
      </Nav>

    </Container>
  )
}

function ListeApplications(props) {

  // Combiner et trier liste d'applications internes et externes
  var apps = [...props.applicationsExternes]
  apps = apps.sort((a,b)=>{
    return a.nomFormatte.localeCompare(b.nomFormatte)
  })

  // <i className="fa fa-external-link-square"/>

  var renderedList = apps.map(app=>{
    if(app.url) {
      return (
        <Nav.Link key={app.url} href={app.url} rel="noopener noreferrer">
          {app.nomFormatte + ' '}
        </Nav.Link>
      )
    } else if(app.load || app.dom) {
      // Application interne, protegee
      return (
        <Nav.Link key={app.nom} eventKey={app.nom}>{app.nomFormatte}</Nav.Link>
      )
    }
    return ''
  })

  return renderedList

}
