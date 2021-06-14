import React, {useState, useEffect, useCallback} from 'react'
import './App.css'
import {Row, Col, Button, Container, Nav} from 'react-bootstrap'
import path from 'path'

var MAP_APPLICATIONS = {}

export default function Applications(props) {

  const [applicationsExternes, setApplicationsExternes] = useState([])

  const {connexion} = props.workers
  const etatProtege = props.rootProps.etatProtege

  useEffect(_=>{
    // Charger liste des apps
    console.debug("Requete liste applications disponibles, modeProtege?%s", etatProtege)
    if(etatProtege) {
      connexion.requeteListeApplications().then(applications=>{
        console.debug("Liste applications : %O", applications)
        setApplicationsExternes(applications)
      }).catch(err=>{console.error("Erreur chargement liste applications : %O", err)})
    }
  }, [etatProtege])

  return (
    <>
      <h3>Applications</h3>

      <Row>
        <Col lg={4}>
          <Nav className="flex-column" onSelect={props.setApplication}>
            <ListeApplications
              applicationsExternes={applicationsExternes} />
          </Nav>
        </Col>
      </Row>
    </>
  )

}

function ListeApplications(props) {

  // Combiner et trier liste d'applications internes et externes
  var apps = [...props.applicationsExternes]
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

  var renderedList = apps.map(app=>{
    if(app.url) {
      return (
        <Nav.Link key={app.url} href={app.url} rel="noopener noreferrer">
          {app.application + ' '}
        </Nav.Link>
      )
    }

    // Application non supportee
    return <p key={app.application}>{app.application}</p>
  })

  return renderedList

}
