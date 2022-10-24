import React, {useState, useEffect, useCallback} from 'react'
import './App.css'
import {Row, Col, Button, Container, Nav, Alert} from 'react-bootstrap'
import path from 'path'

var MAP_APPLICATIONS = {}

export default function Applications(props) {

  const [applicationsExternes, setApplicationsExternes] = useState([])

  const {connexion} = props.workers
  const {etatProtege, dateChargementCle} = props.rootProps

  useEffect(_=>{
    // Charger liste des apps
    console.debug("Requete liste applications disponibles, modeProtege?%s", etatProtege)
    if(etatProtege) {
      connexion.requeteListeApplications().then(applications=>{
        console.debug("Liste applications : %O", applications)
        setApplicationsExternes(applications)
      }).catch(err=>{console.error("Erreur chargement liste applications : %O", err)})
    }
  }, [etatProtege, connexion, dateChargementCle])

  if(applicationsExternes.length === 0) {
    return (
      <Alert variant="warning">
        <Alert.Heading>Applications</Alert.Heading>
        Aucunes applications disponibles.
      </Alert>
    )
  }

  return (
    <>
      <h3>Applications</h3>

      <Row>
        <Col lg={4}>
          <Nav className="flex-column" onSelect={props.setApplication}>
            <ListeApplications
              applicationsExternes={applicationsExternes} 
              typeAdresse={props.typeAdresse} />
          </Nav>
        </Col>
      </Row>
    </>
  )

}

function ListeApplications(props) {

  const applicationsExternes = props.applicationsExternes || []

  // Combiner et trier liste d'applications internes et externes
  var apps = [...applicationsExternes]
  apps.sort((a,b)=>{
    const nomA = a.application || '',
          nomB = b.application || ''

    if(nomA === nomB) return 0
    return nomA.localeCompare(nomB)
  })
  // apps = apps.sort((a,b)=>{
  //   return a.nomFormatte.localeCompare(b.nomFormatte)
  // })

  // <i className="fa fa-external-link-square"/>

  const typeAdresse = props.typeAdresse

  const urlLocal = new URL(window.location.href)

  var renderedList = apps.map(app=>{
    if(app.url) {

      const urlLocalApp = new URL(urlLocal.href)
      const urlApp = new URL(app.url)
      urlLocalApp.pathname = urlApp.pathname

      console.debug("URL local %O, urlApp %O, urlLocalApp %O", urlLocal, urlApp, urlLocalApp)

      return (
        <Nav.Link key={urlLocalApp.href} href={app[typeAdresse]} rel="noopener noreferrer">
          {app.application + ' '}
        </Nav.Link>
      )
    }

    // Application non supportee
    return <p key={app.application}>{app.application}</p>
  })

  return renderedList

}
