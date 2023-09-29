import axios from 'axios'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Nav from 'react-bootstrap/Nav'
import Alert from 'react-bootstrap/Alert'

import { useTranslation, Trans } from 'react-i18next'

import {BoutonAjouterWebauthn, BoutonMajCertificatWebauthn, preparerNouveauCertificat} from './WebAuthn'

import useWorkers, { useEtatPret, useEtatSessionActive, useUsagerDb, useEtatConnexion, useUsagerWebAuth, useUsagerSocketIo } from './WorkerContext'

export default function Applications(props) {

  const { erreurCb } = props

  const workers = useWorkers(),
        etatPret = useEtatPret(),
        usagerDb = useUsagerDb()[0],
        etatConnexion = useEtatConnexion()

  const { connexion } = workers
  // const usagerExtensions = usager.extensions
  const usagerProprietaire = true  // TODO: Fix me : usagerExtensions.delegationGlobale === 'proprietaire'

  const [applicationsExternes, setApplicationsExternes] = useState([])
  const [webauthnActif, setWebauthnActif] = useState(true)  // Par defaut, on assume actif (pas de warning).

  useEffect(()=>{
    // Charger liste des apps
    if(etatPret && etatConnexion) {
      connexion.requeteListeApplications().then(reponse=>{
        const applications = reponse.resultats
        console.debug("Liste applications : %O", applications)
        setApplicationsExternes(applications)
      }).catch(err=>{console.error("Erreur chargement liste applications : %O", err)})
    }
  }, [etatPret, etatConnexion, connexion])

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

/** Section qui detecte si on doit ajouter une methode d'authentification forte. */
function DemanderEnregistrement(props) {
  const { webauthnActif, setWebauthnActif, erreurCb } = props

  // const { infoUsagerBackend, erreurCb, webauthnActif, setWebauthnActif } = props

  const { t } = useTranslation()
  const workers = useWorkers()
  const usagerDb = useUsagerDb()[0]
  const [usagerWebAuth, setUsagerWebAuth] = useUsagerWebAuth()

  const confirmationEnregistrement = useCallback(message=>{
      setWebauthnActif(true)  // Toggle alert
  }, [setWebauthnActif])

  // Load usagerWebAuth si non disponible
  useEffect(()=>{
    if(!usagerDb) return
    console.debug("Applications usagerDb : ", usagerDb)
    const nomUsager = usagerDb.nomUsager,
          fingerprintPkCourant = usagerDb.fingerprintPk

    if(!usagerWebAuth) {
      // Charger usagerWebAuth, utiliser fingerprintPk courant pour verifier sont etat d'activation
      axios({method: 'POST', url: '/auth/get_usager', data: {nomUsager, hostname: window.location.hostname, fingerprintPkCourant}})
        .then(reponse=>{
          const contenu = JSON.parse(reponse.data.contenu)
          console.debug("Applications Chargement get_usager ", contenu)
          setUsagerWebAuth(contenu)
        })
        .catch(err=>console.error("Erreur chargement usager ", err))
    }
  }, [workers, usagerDb, usagerWebAuth, setUsagerWebAuth, setWebauthnActif])

  // Verifier si le certificat permet de s'authentifier sans webauthn (pour activation)
  useEffect(()=>{
    if(!usagerWebAuth) return
    console.debug("Verifier si activation presente pour usager ", usagerWebAuth)
    const methodesDisponibles = usagerWebAuth.methodesDisponibles || {}
    if(methodesDisponibles.activation) {
      console.info("Auth sans webauthn disponible pour le cert local - INSECURE")
      setWebauthnActif(false)  // Activation disponible pour ce cert, insecure
    }
  }, [workers, usagerWebAuth, setUsagerWebAuth, setWebauthnActif])

  return (
      <Alert show={!webauthnActif} variant="warning">
          <p>{t('Applications.compte-debloque-1')}</p>
          <p>{t('Applications.compte-debloque-2')}</p>

          <BoutonAjouterWebauthn 
              workers={workers}
              confirmationCb={confirmationEnregistrement}
              erreurCb={erreurCb}
              variant="secondary">
                +<i className='fa fa-key'/>
          </BoutonAjouterWebauthn>

      </Alert>
  )
}

function UpdateCertificat(props) {
  const { confirmationCb, erreurCb, disabled } = props
  console.debug("UpdateCertificat proppies %O", props)

  // const { infoUsagerBackend, setInfoUsagerBackend, confirmationCb, erreurCb, disabled } = props

  const workers = useWorkers()
  const usagerDb = useUsagerDb()[0]
  const [usagerWebAuth, setUsagerWebAuth] = useUsagerWebAuth()

  // Verifier si usagerDb.delegations_version est plus vieux que webauth.infoUsager.delegations_versions
  const versionObsolete = useMemo(()=>{
    if(disabled || !usagerDb || !usagerWebAuth ) return false
    console.debug("UpdateCertificat verifier version obsolete : usagerDb %O, usagerWebAuth %O, usagerSocketIo %O", 
      usagerDb, usagerWebAuth)

    const versionDb = usagerDb.delegations_version || 0
    let obsolete = false

    // Utiliser usagerWebAuth pour information a jour
    if(usagerWebAuth && usagerWebAuth.infoUsager && usagerWebAuth.infoUsager.delegations_version !== undefined) {
      const infoUsager = usagerWebAuth.infoUsager
      const versionCompte = infoUsager.delegations_version || 0
      console.debug("Version delegations compte : ", versionCompte)
      obsolete = versionDb < versionCompte
    } else if(usagerDb) {
      // Faire un chargement en differe de l'information dans infoVersion.
      const nomUsager = usagerDb.nomUsager
      console.debug("getInfoUsager pour %s", nomUsager)
      workers.connexion.getInfoUsager(nomUsager, {hostname: window.location.hostname})
        .then(infoVersionReponse=>{
          console.debug("Reception infoVersion : ", infoVersionReponse)
          if(infoVersionReponse.ok === true) {
            const infoUsager = usagerWebAuth.infoUsager?{...usagerWebAuth.infoUsager}:{}
            infoUsager.delegations_version = 0  // Evite une boucle infinie en cas de reponse sans delegations_version
            Object.assign(infoUsager, infoVersionReponse.compte)
            setUsagerWebAuth({...usagerWebAuth, infoUsager})
          }
        })
        .catch(erreurCb)
    }
    console.debug("UpdateCertificat obsolete %s : db=%s", obsolete, versionDb)

    return obsolete
  }, [workers, usagerDb, usagerWebAuth, setUsagerWebAuth, erreurCb])

  const confirmationCertificatCb = useCallback( resultat => {
      console.debug("Resultat update certificat : %O", resultat)
      if(confirmationCb) confirmationCb(resultat)
    
      // Reconnecter avec le nouveau certificat
      workers.connexion.reconnecter()
        .then(()=>workers.connexion.onConnect())
        .catch(erreurCb)

  }, [workers, confirmationCb])

  // Generer nouveau CSR au besoin
  useEffect(()=>{
    if(!versionObsolete) return
    console.warn("Generer nouveau CSR - TODO")
  }, [versionObsolete])

  // const setUsagerDbLocal = useCallback(usager => {
  //   console.debug("UpdateCertificat.setUsagerDbLocal Reload compte pour certificat update - ", usager)
  //   // workers.connexion.onConnect()
  //   //   .catch(erreurCb)
  // }, [workers])

  // useEffect(()=>{
  //   if(usager && !disabled) {
  //       const updates = infoUsagerBackend.updates || {}
  //       const versionLocale = usager.delegations_version,
  //             versionBackend = updates.delegations_version

  //       console.debug("UpdateCertificat (usager: %O) versionLocale: %O, versionBackend: %O", infoUsagerBackend, versionLocale, versionBackend)

  //       if(!versionBackend) {
  //           setVersionObsolete(false)  // Desactiver si on n'a pas d'info du backend
  //       } else if(versionLocale !== versionBackend) {
  //         const requete = usager.requete || {}
  //         if(!requete.fingerprintPk) {
  //           console.debug("UpdateCertificat Generer nouveau certificat pour ", usager)
  //           const nomUsager = usager.nomUsager
  //           preparerNouveauCertificat(workers, nomUsager)
  //             .then(async nouvellesCles => {
  //                 console.debug("Cle challenge/csr : %O", nouvellesCles)
  //                 if(nouvellesCles) {
  //                   const {csr, clePriveePem, fingerprint_pk} = nouvellesCles.cleCsr
  //                   const requete = {csr, clePriveePem, fingerprintPk: fingerprint_pk}
  //                   await workers.usagerDao.updateUsager(nomUsager, {nomUsager, requete})
  //                   await workers.connexion.onConnect()  // TODO - MAJ direct plutot que reload
  //                 }
  //             })
  //             .catch(erreurCb)
  //         }
  //         setVersionObsolete(true)
  //       }
  //   }
  // }, [workers, infoUsagerBackend, usager, setInfoUsagerBackend, erreurCb, disabled])

  if(!usagerDb || !usagerDb.nomUsager) return ''

  return (
      <Alert variant='info' show={versionObsolete && !disabled}>
          <Alert.Heading>Nouveau certificat disponible</Alert.Heading>
          <p>
              De nouvelles informations ou droits d'acces sont disponibles pour votre compte. 
              Cliquez sur le bouton <i>Mettre a jour</i> et suivez les instructions pour mettre a jour 
              le certificat de securite sur ce navigateur.
          </p>

          <BoutonMajCertificatWebauthn 
              usager={usagerDb}
              onSuccess={confirmationCertificatCb}
              onError={erreurCb}            
              variant="secondary">
              Mettre a jour
          </BoutonMajCertificatWebauthn>
      </Alert>
  )
}

