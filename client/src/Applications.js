import React, { useState, useEffect, useMemo } from 'react'

import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Nav from 'react-bootstrap/Nav'
import Alert from 'react-bootstrap/Alert'

import { useTranslation, Trans } from 'react-i18next'

import { pki } from '@dugrema/node-forge'
import { forgecommon } from '@dugrema/millegrilles.reactjs'

import useWorkers, { useEtatPret, useUsagerDb, useEtatConnexion, useEtatSocketioAuth, useVersionCertificat } from './WorkerContext'
import UpdateCertificat from './CertificatUsager'
import DemanderEnregistrement from './WebAuthn'

export default function Applications(props) {

  const { erreurCb } = props

  const workers = useWorkers(),
        etatPret = useEtatPret(),
        usagerDb = useUsagerDb()[0],
        etatConnexion = useEtatConnexion(),
        etatSocketioAuth = useEtatSocketioAuth()

  const { connexion } = workers

  // const setVersionCertificat = useVersionCertificat()[1]

  const [usagerProprietaire, securite] = useMemo(()=>{
    console.debug("Applications UsagerDb ", usagerDb)
    if(!usagerDb) return false
    const extensions = usagerDb.extensions || {}
    const securite = usagerDb.securite || '1.public'
    const estProprietaire = extensions.delegationGlobale === 'proprietaire'
    // console.debug("Info usagerDb : %O\nEstProprietaire: %s, securite %s", usagerDb, estProprietaire, securite)
    return [estProprietaire, securite]
  }, [usagerDb])

  const [applicationsExternes, setApplicationsExternes] = useState('')
  const [instanceId, setInstanceId] = useState('')
  const [webauthnActif, setWebauthnActif] = useState(true)  // Par defaut, on assume actif (pas de warning).

  // const majUsagerHandler = useMemo(() => {
  //   const cb = e => {
  //     console.debug("Applications Reception maj usager ", e)
  //     const message = e.message || {}
  //     const delegations_version = message.delegations_version || ''
  //     const delegations_date = message.delegations_date || ''
  //     setVersionCertificat({delegations_version, delegations_date})
  //   }
  //   return proxy(cb)
  // }, [setVersionCertificat])

  useEffect(()=>{
    // Charger liste des apps
    if(etatPret && etatConnexion && etatSocketioAuth) {
      connexion.requeteListeApplications().then(reponse=>{
        console.debug("Applications Reponse liste applications : %O", reponse)
        const applications = reponse.ok!==false?reponse.resultats:[]
        const attachements = reponse['__original'].attachements || {}
        extraireIdentiteServeur(workers, attachements.serveur, setInstanceId)
          .catch(err=>console.warn("Erreur extraireIdentiteServeur : %O", err))
        setApplicationsExternes(applications)
      }).catch(err=>{console.error("Erreur chargement liste applications : %O", err)})
    }
  }, [etatPret, etatConnexion, etatSocketioAuth, setInstanceId, connexion])

  // // Ecouter les changements du compte usager
  // useEffect(()=>{
  //   if(!etatPret || !etatConnexion || !etatSocketioAuth) return
    
  //   workers.connexion.enregistrerCallbackEvenementsCompteUsager(majUsagerHandler)
  //     .catch(err=>console.error("Erreur enregistrement listener compte usager", err))
  //   return () => {
  //     workers.connexion.retirerCallbackEvenementsCompteUsager(majUsagerHandler)
  //       .catch(err=>console.error("Erreur retrait listener compte usager", err))
  //   }
  // }, [workers, majUsagerHandler, etatPret, etatConnexion, etatSocketioAuth])

  const classNameUsager = usagerProprietaire?'usager-proprietaire':''

  return (
    <div>
      <Row>
          <Col xs={12} md={6}>
  
              <p className={'usager ' + classNameUsager}><i className='fa fa-user-circle-o' />{' @' + usagerDb.nomUsager}</p>

              <DemanderEnregistrement 
                webauthnActif={webauthnActif}
                setWebauthnActif={setWebauthnActif}
                erreurCb={erreurCb} />

              <UpdateCertificat
                  disabled={webauthnActif?false:true}
                  erreurCb={erreurCb} />

          </Col>
          <Col xs={12} md={6}>
              <h2><Trans>Applications.titre</Trans></h2>

              <ListeApplications 
                applicationsExternes={applicationsExternes} 
                usagerProprietaire={usagerProprietaire}
                securite={securite}
                instanceId={instanceId} />
          </Col>
      </Row>

    </div>
  )

}

async function extraireIdentiteServeur(workers, reponse, setInstanceId) {
  // console.debug("extraireIdentiteServeur Reponse : %O", reponse)

  const validation = await workers.connexion.verifierMessage(reponse)
  // console.debug("extraireIdentiteServeur Resultat validation : %O", validation)
  if(validation) {
    const certPem = reponse.certificat[0]
    const certForge = pki.certificateFromPem(certPem)
    // console.debug("CertForge ", certForge)
    const commonName = certForge.subject.getField('CN').value
    const extensions = forgecommon.extraireExtensionsMillegrille(certPem)
    // console.debug("extraireIdentiteServeur CN: %s, Extensions %O", commonName, extensions)

    if(commonName && extensions.roles.includes('maitrecomptes')) {
      return setInstanceId(commonName)
    }
  }

  // Reset identite serveur
  setInstanceId('')
}

function ListeApplications(props) {

  const { applicationsExternes, securite, instanceId } = props

  const typeAdresseProps = props.typeAdresse

  // Combiner et trier liste d'applications internes et externes
  const apps = useMemo(()=>{
    if(!applicationsExternes || !instanceId) return null
    // console.debug("ListeApplications instance_id: %s, apps : ", instanceId, applicationsExternes)
    var apps = [...applicationsExternes]

    // Filtrer par niveau de securite
    // console.debug("ListeApplications Liste apps complete: ", apps)
    let niveauxSecurite = ['1.public']
    if(securite === '2.prive') niveauxSecurite.push('2.prive')
    if(securite === '3.protege') niveauxSecurite = niveauxSecurite.concat(['2.prive', '3.protege'])
    if(securite === '4.secure') niveauxSecurite = niveauxSecurite.concat(['2.prive', '3.protege', '4.secure'])
    // console.debug("ListeApplications Niveaux de securite pour usager : ", niveauxSecurite)
    apps = apps.filter(item=>niveauxSecurite.includes(item.securite))

    // console.debug("ListeApplications Liste apps filtree pour %s : %O", securite, apps)

    apps.sort((a,b)=>{
      const nomA = a.application || '',
            nomB = b.application || ''

      if(nomA === nomB) return 0
      return nomA.localeCompare(nomB)
    })
    return apps
  }, [instanceId, applicationsExternes, securite])

  const [urlLocal, typeAdresse, adressesParHostname, adressesPourInstance] = useMemo(()=>{
    const urlLocal = new URL(window.location.href)
    if(!apps) return [urlLocal, null, {}, '']

    // console.debug("ListeApplications applicationsExternes ", applicationsExternes)

    // const urlLocal = new URL(window.location.href)
    const typeAdresse = typeAdresseProps || urlLocal.hostname.endsWith('.onion')?'onion':'url'

    // Separer applications par site
    const adressesParHostname = {}
    const adressesPourInstance = []
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

          if(app.instance_id === instanceId) {
            adressesPourInstance.push(app)
          }
        }
      }
    }

    // console.debug("urlLocal %O, typeAdresse %O, adresseParHostname %O, adressesPourInstance: %O", 
    //   urlLocal, typeAdresse, adressesParHostname, adressesPourInstance)

    return [urlLocal, typeAdresse, adressesParHostname, adressesPourInstance]
  }, [instanceId, apps, typeAdresseProps])

  if(!applicationsExternes) {
    return (
      <Alert variant="dark">
        <Alert.Heading><Trans>Applications.titre</Trans></Alert.Heading>
        <Trans>Applications.chargementEnCours</Trans><i className="fa fa-spinner fa-spin" />
      </Alert>
    )
  } else if (applicationsExternes.length === 0) {
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
          apps={adressesPourInstance} />
      </Nav>

    </div>
  )
}

function ListeApplicationsSite(props) {
  const { urlSite, typeAdresse, apps } = props

  const { t } = useTranslation()

  // if(!apps) return ''

  if(apps === '') {
    return (
      <Alert variant="dark">
        <Alert.Heading><Trans>Applications.titre</Trans></Alert.Heading>
        <Trans>Applications.chargementEnCours</Trans><i className="fa fa-spinner fa-spin" />
      </Alert>
    )
  }

  if(!apps || apps.length === 0) {
    return (
      <Alert variant="dark">
        <Alert.Heading><Trans>Applications.titre</Trans></Alert.Heading>
        <Trans>Applications.nondisponibles</Trans>
      </Alert>
    )
  }

  return apps.filter(item=>{
    // Retirer Web Services (aucune interface usager)
    return item.supporte_usagers === undefined || item.supporte_usagers !== false
  }).map(app=>{
    const adresse = new URL(app[typeAdresse])
    adresse.hostname = urlSite.hostname  // Remplacer hostname au besoin
    adresse.port = urlSite.port  // Remplacer port au besoin

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
