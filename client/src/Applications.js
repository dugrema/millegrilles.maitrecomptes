import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Nav from 'react-bootstrap/Nav'
import Alert from 'react-bootstrap/Alert'

import { useTranslation, Trans } from 'react-i18next'

import {BoutonAjouterWebauthn, BoutonMajCertificatWebauthn} from './WebAuthn'

import useWorkers, { useUsager, useEtatPret } from './WorkerContext'
import { chargerUsager } from './comptesUtil'

export default function Applications(props) {

  const { erreurCb } = props

  const workers = useWorkers(),
        etatPret = useEtatPret(),
        usager = useUsager()

  const { connexion } = workers
  const usagerExtensions = usager.extensions
  const usagerProprietaire = usagerExtensions.delegationGlobale === 'proprietaire'

  const [applicationsExternes, setApplicationsExternes] = useState([])
  const [infoUsagerBackend, setInfoUsagerBackend] = useState('')

  useEffect(()=>{
    // Charger liste des apps
    if(etatPret) {
      connexion.requeteListeApplications().then(applications=>{
        // console.debug("Liste applications : %O", applications)
        setApplicationsExternes(applications)
      }).catch(err=>{console.error("Erreur chargement liste applications : %O", err)})
    }
  }, [etatPret, usagerExtensions, connexion])

  useEffect(()=>{
    if(!usager) return
    const nomUsager = usager.nomUsager
    chargerUsager(workers.connexion, nomUsager)
      .then(compteUsager=>{
        // console.debug("Compte usager : ", compteUsager)
        setInfoUsagerBackend(compteUsager.infoUsager)
      })
      .catch(erreurCb)
  }, [workers, usager, setInfoUsagerBackend])

  return (
    <div>
      <Row>
          <Col xs={12} md={6}>
              <DemanderEnregistrement 
                infoUsagerBackend={infoUsagerBackend}
                erreurCb={erreurCb} />

              <UpdateCertificat
                  infoUsagerBackend={infoUsagerBackend}
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

    // console.debug("ListeApplications applicationsExternes ", applicationsExternes)

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

    // console.debug("urlLocal %O, typeAdresse %O, adresseParHostname %O", urlLocal, typeAdresse, adressesParHostname)

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
        adressesParHostname={adressesParHostname} />

      <ListeSatellites
        urlSite={urlLocal} 
        typeAdresse={typeAdresse} 
        adressesParHostname={adressesParHostname} 
        onion={true} />

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
  const onion = props.onion || false

  const listeSatellitesTiers = useMemo(()=>{
    if(!adressesParHostname) return []

    // console.debug("ListeSatellites adresseParHostname ", adressesParHostname)

    const listeSatellitesTiers = Object.keys(adressesParHostname)
      .filter(item=>{
        if(item === urlSite.hostname) return false  // Site courant
        else if(item.endsWith('.onion')) return onion  // Site .onion, retourner true si on veut ce type
        else return !onion  // Site url (pas .onion), retourner true si on ne veut pas le type .onion
      })

    return listeSatellitesTiers
  }, [urlSite, adressesParHostname, onion])

  if(listeSatellitesTiers.length === 0) return ''

  let titre = null
  if(onion) {
    titre = (
      <>
        <h4>Sites Tor</h4>
        <p>Note : les hyperliens .onion requierent un navigateur qui a acces au reseau Tor (e.g. Brave en mode 'prive tor').</p>
      </>
    )

  } else titre = <h4>Sites alternatifs</h4>

  return (
    <div>
      {titre}

      <Nav className="flex-column applications">
        {listeSatellitesTiers.map(item=>{
          let className = ''
          let label = item
          if(item.endsWith('.onion')) {
            className += ' tor-nav'
            label = label.slice(0, 8) + '[...]' + label.slice(48)
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

function DemanderEnregistrement(props) {

  const { infoUsagerBackend, erreurCb } = props

  const { t } = useTranslation()
  const workers = useWorkers(),
        usager = useUsager()

  const [webauthnActif, setWebauthnActif] = useState(true)  // Par defaut, on assume actif (pas de warning).

  const confirmationEnregistrement = useCallback(message=>{
      setWebauthnActif(true)  // Toggle alert
  }, [setWebauthnActif])

  useEffect(()=>{
      if(usager && infoUsagerBackend) {
        // console.debug("DemanderEnregistrement usager %O, infoUsagerBackend", usager, infoUsagerBackend)

          if(infoUsagerBackend.compteUsager === false) {
            return setWebauthnActif(false)
          }

          let activation = infoUsagerBackend.activation

          if(activation && activation.associe == false) {
            return setWebauthnActif(false)
          }
          
      }

      setWebauthnActif(true)
  }, [usager, infoUsagerBackend])

  return (
      <Alert show={!webauthnActif} variant="warning">
          <p>{t('Applications.compte-debloque-1')}</p>
          <p>{t('Applications.compte-debloque-2')}</p>

          <BoutonAjouterWebauthn 
              workers={workers}
              usagerDbLocal={usager}
              confirmationCb={confirmationEnregistrement}
              erreurCb={erreurCb}
              variant="secondary">
                +<i className='fa fa-key'/>
          </BoutonAjouterWebauthn>

      </Alert>
  )
}

function UpdateCertificat(props) {
  const { confirmationCb, erreurCb } = props

  const workers = useWorkers(),
        usager = useUsager()

  const [versionObsolete, setVersionObsolete] = useState(false)

  const confirmationCertificatCb = useCallback( resultat => {
      // console.debug("Resultat update certificat : %O", resultat)
      if(confirmationCb) confirmationCb(resultat)
  }, [confirmationCb])

  const setUsagerDbLocal = useCallback(usager => {
    // console.debug("UpdateCertificat.setUsagerDbLocal Reload compte pour certificat update - ", usager)
    workers.connexion.onConnect()
      .catch(erreurCb)
  }, [workers])

  useEffect(()=>{
      if(usager) {
          const updates = usager.updates || {}
          const versionLocale = usager.delegations_version,
                versionBackend = updates.delegations_version

          if(!versionBackend) {
              setVersionObsolete(false)  // Desactiver si on n'a pas d'info du backend
          } else {
              setVersionObsolete(versionLocale !== versionBackend)
          }
      }
  }, [usager])

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
              usagerDbLocal={usager}
              setUsagerDbLocal={setUsagerDbLocal}
              confirmationCb={confirmationCertificatCb}
              onError={erreurCb}            
              variant="secondary">
              Mettre a jour
          </BoutonMajCertificatWebauthn>
      </Alert>
  )
}

