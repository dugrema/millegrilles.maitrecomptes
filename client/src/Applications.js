import React, {useState, useEffect} from 'react'
import './App.css'
import {Row, Col, Nav, Alert} from 'react-bootstrap'

export default function Applications(props) {

  const { workers, etatConnexion } = props
  const { connexion } = workers

  const [applicationsExternes, setApplicationsExternes] = useState([])

  useEffect(_=>{
    // Charger liste des apps
    console.debug("Requete liste applications disponibles, connecte?%s", etatConnexion)
    if(etatConnexion) {
      connexion.requeteListeApplications().then(applications=>{
        console.debug("Liste applications : %O", applications)
        setApplicationsExternes(applications)
      }).catch(err=>{console.error("Erreur chargement liste applications : %O", err)})
    }
  }, [etatConnexion, connexion])

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

  const typeAdresse = props.typeAdresse || 'url'

  var renderedList = apps.map(app=>{
    if(app.url) {
      return (
        <Nav.Link key={app.url} href={app[typeAdresse]} rel="noopener noreferrer">
          {app.application + ' '}
        </Nav.Link>
      )
    }

    // Application non supportee
    return <p key={app.application}>{app.application}</p>
  })

  return renderedList

}
