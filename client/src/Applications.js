import React, {useState, useEffect} from 'react'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Nav from 'react-bootstrap/Nav'
import Alert from 'react-bootstrap/Alert'
import Tooltip from 'react-bootstrap/Tooltip'
import OverlayTrigger from 'react-bootstrap/OverlayTrigger'
import Button from 'react-bootstrap/Button'

import { useTranslation, Trans } from 'react-i18next'

export default function Applications(props) {

  const { workers, etatAuthentifie, usagerDbLocal, setSectionAfficher } = props
  const { connexion } = workers
  const usagerExtensions = props.usagerExtensions || {}
  const usagerProprietaire = usagerExtensions.delegationGlobale === 'proprietaire'

  const [applicationsExternes, setApplicationsExternes] = useState([])

  useEffect(_=>{
    // Charger liste des apps
    // console.debug("Requete liste applications disponibles, connecte?%s", etatAuthentifie)
    if(etatAuthentifie) {
      connexion.requeteListeApplications().then(applications=>{
        // console.debug("Liste applications : %O", applications)
        setApplicationsExternes(applications)
      }).catch(err=>{console.error("Erreur chargement liste applications : %O", err)})
    }
  }, [etatAuthentifie, connexion])

  if(applicationsExternes.length === 0) {
    return (
      <Alert variant="dark">
        <Alert.Heading><Trans>Applications.titre</Trans></Alert.Heading>
        <Trans>Applications.nondisponibles</Trans>
      </Alert>
    )
  }

  return (
    <div>
      <Row>
          <Col xs={12} md={6}>
              <h2><Trans>Applications.compte</Trans></h2>

              <Alert show={usagerProprietaire} variant="dark">
                  <Alert.Heading><Trans>Applications.proprietaire-compte</Trans></Alert.Heading>
                  <p><Trans>Applications.proprietaire-info</Trans></p>
              </Alert>

              <p>{usagerDbLocal.nomUsager}</p>

              <BoutonsUsager usagerProprietaire={usagerProprietaire} setSectionAfficher={setSectionAfficher} />

          </Col>
          <Col xs={12} md={6}>
              <h2><Trans>Applications.titre</Trans></h2>

              <ListeApplications 
                applicationsExternes={applicationsExternes} 
                usagerProprietaire={usagerProprietaire} />
          </Col>
      </Row>

    </div>
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

  return (
    <Nav className="flex-column applications">
      {renderedList}
    </Nav>
  )
}

function BoutonsUsager(props) {

  const { usagerProprietaire, setSectionAfficher } = props

  const handlerAfficherAjouterMethode = () => setSectionAfficher('SectionAjouterMethode')
  const handlerAfficherActiverCode = () => setSectionAfficher('SectionActiverCompte')
  const handlerAfficherActiverDelegation = () => setSectionAfficher('SectionActiverDelegation')

  const renderTooltipAjouterMethode = (props) => (
      <Tooltip id="button-ajoutermethode" {...props}>
        <Trans>Applications.popup-ajouter-methode</Trans>
      </Tooltip>
    )

  const renderTooltipActiverCode = (props) => (
      <Tooltip id="button-activercode" {...props}>
        <Trans>Applications.popup-activer-code</Trans>
      </Tooltip>
    )

  const renderTooltipActiverDelegation = (props) => (
      <Tooltip id="button-activercode" {...props}>
        <Trans>Applications.popup-prendre-controle</Trans>
      </Tooltip>
    )

  const delay = { show: 250, hide: 400 }

  return (
      <div className="liste-boutons">
          <OverlayTrigger placement="bottom" delay={delay} overlay={renderTooltipAjouterMethode}>
              <Button variant='secondary' onClick={handlerAfficherAjouterMethode}>+<i className='fa fa-key'/></Button>
          </OverlayTrigger>

          <OverlayTrigger placement="bottom" delay={delay} overlay={renderTooltipActiverCode}>
              <Button variant='secondary' onClick={handlerAfficherActiverCode}>+<i className='fa fa-tablet'/></Button>
          </OverlayTrigger>

          <OverlayTrigger placement="bottom" delay={delay} overlay={renderTooltipActiverDelegation}>
              <Button variant='secondary' onClick={handlerAfficherActiverDelegation} disabled={!!usagerProprietaire}><i className='fa fa-certificate'/></Button>
          </OverlayTrigger>
      </div>
  )
}