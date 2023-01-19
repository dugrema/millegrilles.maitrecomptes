import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Nav from 'react-bootstrap/Nav'
import Alert from 'react-bootstrap/Alert'
import Tooltip from 'react-bootstrap/Tooltip'
import OverlayTrigger from 'react-bootstrap/OverlayTrigger'
import Button from 'react-bootstrap/Button'

import { useTranslation, Trans } from 'react-i18next'

import {BoutonAjouterWebauthn, BoutonMajCertificatWebauthn} from './WebAuthn'

import useWorkers, {useEtatConnexion, WorkerProvider, useUsager, useEtatPret, useInfoConnexion} from './WorkerContext'

export default function Applications(props) {

  const { 
    usagerDbLocal, infoUsagerBackend, erreurCb,  
    setSectionAfficher, setUsagerDbLocal, resultatAuthentificationUsager
  } = props

  const workers = useWorkers(),
        etatPret = useEtatPret(),
        usager = useUsager()

  const { connexion } = workers
  const usagerExtensions = usager.extensions
  const usagerProprietaire = usagerExtensions.delegationGlobale === 'proprietaire'

  const [applicationsExternes, setApplicationsExternes] = useState([])

  useEffect(_=>{
    // Charger liste des apps
    // console.debug("Requete liste applications disponibles, connecte?%s", etatAuthentifie)
    if(etatPret && usagerExtensions) {
      connexion.requeteListeApplications().then(applications=>{
        console.debug("Liste applications : %O", applications)
        setApplicationsExternes(applications)
      }).catch(err=>{console.error("Erreur chargement liste applications : %O", err)})
    }
  }, [etatPret, usagerExtensions, connexion])

  return (
    <div>
      <Row>
          <Col xs={12} md={6}>
              <DemanderEnregistrement 
                workers={workers} 
                usagerDbLocal={usager}
                infoUsagerBackend={infoUsagerBackend}
                erreurCb={erreurCb} />

              <UpdateCertificat
                  workers={workers} 
                  usagerDbLocal={usager}
                  infoUsagerBackend={infoUsagerBackend}
                  resultatAuthentificationUsager={resultatAuthentificationUsager}
                  erreurCb={erreurCb} />

              <Alert show={usagerProprietaire} variant="dark">
                  <Alert.Heading><Trans>Applications.proprietaire-compte</Trans></Alert.Heading>
                  <p><Trans>Applications.proprietaire-info</Trans></p>
              </Alert>

              <p>{usager.nomUsager}</p>

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
  const typeAdresseProps = props.typeAdresse
  // console.debug("ListeApplications apps : ", applicationsExternes)

  // Combiner et trier liste d'applications internes et externes
  const apps = useMemo(()=>{
    if(!applicationsExternes) return null
    var apps = [...applicationsExternes]
    apps.sort((a,b)=>{
      const nomA = a.application || '',
            nomB = b.application || ''

      if(nomA === nomB) return 0
      return nomA.localeCompare(nomB)
    })
    return apps
  }, [applicationsExternes])

  const [urlLocal, typeAdresse, adressesParHostname] = useMemo(()=>{
    if(!apps) return [null, null, null]

    const urlLocal = new URL(window.location.href)
    const typeAdresse = typeAdresseProps || urlLocal.hostname.endsWith('.onion')?'onion':'url'

    // Separer applications par site
    const adressesParHostname = {}
    for(const app of apps) {
      const adresses = []
      if(app.url) adresses.push(app.url)
      if(app.onion) adresses.push(app.onion)

      if(adresses.length > 0) {
        for(const adresse of adresses) {
          const urlAdresse = new URL(adresse)
          const hostname = urlAdresse.hostname
          let listeAppsParHostname = adressesParHostname[hostname]
          if(!listeAppsParHostname) {
            listeAppsParHostname = []
            adressesParHostname[hostname] = listeAppsParHostname
          }
          listeAppsParHostname.push(app)
        }
      }
    }

    console.debug("urlLocal %O, typeAdresse %O, adresseParHostname %O", urlLocal, typeAdresse, adressesParHostname)

    return [urlLocal, typeAdresse, adressesParHostname]
  }, [apps, typeAdresseProps])

  if(!applicationsExternes || applicationsExternes.length === 0) {
    return (
      <Alert variant="dark">
        <Alert.Heading><Trans>Applications.titre</Trans></Alert.Heading>
        <Trans>Applications.nondisponibles</Trans>
      </Alert>
    )
  }

  return (
    <div>
      <Nav className="flex-column applications">
        <ListeApplicationsSite 
          urlSite={urlLocal} 
          typeAdresse={typeAdresse} 
          apps={adressesParHostname[urlLocal.hostname]} />
      </Nav>

      <ListeSatellites
        urlSite={urlLocal} 
        typeAdresse={typeAdresse} 
        adressesParHostname={adressesParHostname}  />
    </div>
  )
}

function ListeApplicationsSite(props) {
  const { urlSite, typeAdresse, apps } = props

  const { t } = useTranslation()

  if(!apps) return ''

  return apps.filter(item=>{
    // Retirer Web Services (aucune interface usager)
    return item.supporte_usagers === undefined || item.supporte_usagers !== false
  }).map(app=>{
    const adresse = new URL(app[typeAdresse])

    let label = 'noname'
    // Utiliser property pour nom application traduite si disponible
    if(app.nameprop) {
      label = t(app.name_property)
    } else if(app.application) {
      label = app.application.replace('_', ' ')
    }

    return (
      <Nav.Link key={adresse.href} href={adresse.href} rel="noopener noreferrer">
        {label}
      </Nav.Link>
    )
  })
}

function ListeSatellites(props) {
  const { urlSite, typeAdresse, adressesParHostname } = props

  const listeSatellitesTiers = useMemo(()=>{
    if(!adressesParHostname) return ''

    console.debug("ListeSatellites adresseParHostname ", adressesParHostname)

    const listeSatellitesTiers = Object.keys(adressesParHostname).filter(item=>item !== urlSite.hostname)

    return listeSatellitesTiers
  }, [urlSite, adressesParHostname])

  if(!listeSatellitesTiers) return ''

  return (
    <div>
      <h3>Sites alternatifs</h3>

      <Nav className="flex-column applications">
        {listeSatellitesTiers.map(item=>{
          let className = ''
          let label = item
          if(item.endsWith('.onion')) {
            console.debug("ONION ", item)
            className += ' tor-nav'
            label = label.slice(0, 12) + '[...]' + label.slice(50)
          }
          return (
            <Nav.Link key={item} className={className} href={'https://' + item}>
              {label}
            </Nav.Link>
          )
        })}
      </Nav>
    </div>
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

function DemanderEnregistrement(props) {

  const { workers, usagerDbLocal, infoUsagerBackend, erreurCb } = props

  const { t } = useTranslation()

  const [webauthnActif, setWebauthnActif] = useState(true)  // Par defaut, on assume actif (pas de warning).

  const confirmationEnregistrement = useCallback(message=>{
      setWebauthnActif(true)  // Toggle alert
  }, [setWebauthnActif])

  useEffect(()=>{
      if(usagerDbLocal && infoUsagerBackend) {
          const fingerprintCourant = usagerDbLocal.fingerprintPk
          const webauthn = infoUsagerBackend.webauthn
          const activations = infoUsagerBackend.activations_par_fingerprint_pk

          if(activations && activations[fingerprintCourant]) {
              const infoActivation = activations[fingerprintCourant]
              if(infoActivation.associe === false) {
                  // Le navigateur est debloque - on affiche le warning
                  return setWebauthnActif(false)
              }
          } 
          
          if(webauthn) {
              const credentials = infoUsagerBackend.webauthn || []
              const actif = credentials.length > 0
              // S'assurer qu'on a au moins 1 credential webauthn sur le compte
              return setWebauthnActif(actif)
          } 
          
      }

      // Aucune methode webauthn trouvee
      setWebauthnActif(false)
  }, [usagerDbLocal, infoUsagerBackend])

  return (
      <Alert show={!webauthnActif} variant="warning">
          <p>{t('Applications.compte-debloque-1')}</p>
          <p>{t('Applications.compte-debloque-2')}</p>

          <BoutonAjouterWebauthn 
              workers={workers}
              usagerDbLocal={usagerDbLocal}
              confirmationCb={confirmationEnregistrement}
              erreurCb={erreurCb}
              variant="secondary">
                +<i className='fa fa-key'/>
          </BoutonAjouterWebauthn>

      </Alert>
  )
}

function UpdateCertificat(props) {
  const { 
      workers, usagerDbLocal, setUsagerDbLocal, infoUsagerBackend, 
      resultatAuthentificationUsager, confirmationCb, erreurCb, 
  } = props

  const [versionObsolete, setVersionObsolete] = useState(false)

  const confirmationCertificatCb = useCallback( resultat => {
      // console.debug("Resultat update certificat : %O", resultat)
      if(confirmationCb) confirmationCb(resultat)
  }, [confirmationCb])

  useEffect(()=>{
      // console.debug("UsagerDBLocal : %O, infoUsagerBackend : %O", usagerDbLocal, infoUsagerBackend)
      if(infoUsagerBackend && usagerDbLocal) {
          const versionLocale = usagerDbLocal.delegations_version,
              versionBackend = infoUsagerBackend.delegations_version

          if(!versionBackend) {
              setVersionObsolete(false)  // Desactiver si on n'a pas d'info du backend
          } else {
              setVersionObsolete(versionLocale !== versionBackend)
          }
      }
  }, [usagerDbLocal, infoUsagerBackend])

  return (
      <Alert variant='info' show={versionObsolete}>
          <Alert.Heading>Nouveau certificat disponible</Alert.Heading>
          <p>
              De nouvelles informations ou droits d'acces sont disponibles pour votre compte. 
              Cliquez sur le bouton <i>Mettre a jour</i> et suivez les instructions pour mettre a jour 
              le certificat de securite sur ce navigateur.
          </p>

          <BoutonMajCertificatWebauthn 
              workers={workers}
              usagerDbLocal={usagerDbLocal}
              setUsagerDbLocal={setUsagerDbLocal}
              resultatAuthentificationUsager={resultatAuthentificationUsager}
              confirmationCb={confirmationCertificatCb}
              erreurCb={erreurCb}            
              variant="secondary">
              Mettre a jour
          </BoutonMajCertificatWebauthn>
      </Alert>
  )
}

