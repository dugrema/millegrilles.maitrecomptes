import axios from 'axios'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Nav from 'react-bootstrap/Nav'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'

import { useTranslation, Trans } from 'react-i18next'

import { pki } from '@dugrema/node-forge'
import { forgecommon } from '@dugrema/millegrilles.reactjs'

import {BoutonAjouterWebauthn, BoutonMajCertificatWebauthn, preparerNouveauCertificat} from './WebAuthn'

import useWorkers, { useEtatPret, useUsagerDb, useEtatConnexion, useUsagerWebAuth, useEtatSocketioAuth } from './WorkerContext'
import { sauvegarderCertificatPem } from './comptesUtil'

export default function Applications(props) {

  const { erreurCb } = props

  const workers = useWorkers(),
        etatPret = useEtatPret(),
        usagerDb = useUsagerDb()[0],
        etatConnexion = useEtatConnexion(),
        etatSocketioAuth = useEtatSocketioAuth()

  const { connexion } = workers

  const [usagerProprietaire, securite] = useMemo(()=>{
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

  useEffect(()=>{
    // Charger liste des apps
    if(etatPret && etatConnexion && etatSocketioAuth) {
      connexion.requeteListeApplications().then(reponse=>{
        // console.debug("Applications Reponse liste applications : %O", reponse)
        const applications = reponse.ok!==false?reponse.resultats:[]
        const attachements = reponse['__original'].attachements || {}
        extraireIdentiteServeur(connexion, attachements.serveur, setInstanceId)
          .catch(err=>console.warn("Erreur extraireIdentiteServeur : %O", err))
        setApplicationsExternes(applications)
      }).catch(err=>{console.error("Erreur chargement liste applications : %O", err)})
    }
  }, [etatPret, etatConnexion, etatSocketioAuth, setInstanceId, connexion])

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

async function extraireIdentiteServeur(connexion, reponse, setInstanceId) {
  // console.debug("extraireIdentiteServeur Reponse : %O", reponse)

  const validation = await connexion.verifierMessage(reponse)
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

      {/* <ListeSatellites
        urlSite={urlLocal} 
        typeAdresse={typeAdresse} 
        adressesParHostname={adressesParHostname} />

      <ListeSatellites
        urlSite={urlLocal} 
        typeAdresse={typeAdresse} 
        adressesParHostname={adressesParHostname} 
        onion={true} /> */}

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

function ListeSatellites(props) {
  const { urlSite, adressesParHostname } = props
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

  const desactiverAvertissement = useCallback(()=>{
    window.localStorage.setItem('securiteCleHint1', 'false')
    setWebauthnActif(true)
  }, [setWebauthnActif])

  // Load usagerWebAuth si non disponible
  useEffect(()=>{
    if(!usagerDb) return
    // console.debug("Applications usagerDb : ", usagerDb)
    const nomUsager = usagerDb.nomUsager,
          fingerprintPkCourant = usagerDb.fingerprintPk

    if(!usagerWebAuth) {
      // Charger usagerWebAuth, utiliser fingerprintPk courant pour verifier sont etat d'activation
      axios({method: 'POST', url: '/auth/get_usager', data: {nomUsager, hostname: window.location.hostname, fingerprintPkCourant}})
        .then(reponse=>{
          const contenu = JSON.parse(reponse.data.contenu)
          // console.debug("Applications Chargement get_usager ", contenu)
          setUsagerWebAuth(contenu)
        })
        .catch(err=>console.error("Erreur chargement usager ", err))
    }
  }, [workers, usagerDb, usagerWebAuth, setUsagerWebAuth, setWebauthnActif])

  // Verifier si le certificat permet de s'authentifier sans webauthn (pour activation)
  useEffect(()=>{
    if(!usagerWebAuth) return
    // console.debug("Verifier si activation presente pour usager ", usagerWebAuth)
    const infoUsager = usagerWebAuth.infoUsager || {}
    const methodesDisponibles = infoUsager.methodesDisponibles || usagerWebAuth.methodesDisponibles || {}
    if(methodesDisponibles.activation) {
      // console.info("Auth sans webauthn disponible pour le cert local - INSECURE")
      const valeurHint = window.localStorage.getItem('securiteCleHint1')
      if(valeurHint !== 'false') {
        // console.debug("Valeur hint : ", valeurHint)
        setWebauthnActif(false)  // Activation disponible pour ce cert, insecure
      }
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
                Ajouter<i className='fa fa-key'/>
          </BoutonAjouterWebauthn>
          {' '}
          <Button variant="secondary" onClick={desactiverAvertissement}>Ne plus afficher</Button>
      </Alert>
  )
}

function UpdateCertificat(props) {
  const { confirmationCb, erreurCb, disabled } = props
  // console.debug("UpdateCertificat proppies %O", props)

  // const { infoUsagerBackend, setInfoUsagerBackend, confirmationCb, erreurCb, disabled } = props

  const workers = useWorkers()
  const [usagerDb, setUsagerDb] = useUsagerDb()
  const [usagerWebAuth, setUsagerWebAuth] = useUsagerWebAuth()

  // Verifier si usagerDb.delegations_version est plus vieux que webauth.infoUsager.delegations_versions
  const versionObsolete = useMemo(()=>{
    if(disabled || !usagerDb || !usagerWebAuth ) return false
    // console.debug("UpdateCertificat verifier version obsolete : usagerDb %O, usagerWebAuth %O, usagerSocketIo %O", 
    //  usagerDb, usagerWebAuth)

    const versionDb = usagerDb.delegations_version || 0
    let obsolete = false

    // Utiliser usagerWebAuth pour information a jour
    if(usagerWebAuth && usagerWebAuth.infoUsager && usagerWebAuth.infoUsager.delegations_version !== undefined) {
      const infoUsager = usagerWebAuth.infoUsager
      const versionCompte = infoUsager.delegations_version || 0
      // console.debug("UpdateCertificat Version delegations compte : ", versionCompte)
      obsolete = versionDb < versionCompte
    } else if(usagerDb) {
      // Faire un chargement en differe de l'information dans infoVersion.
      const nomUsager = usagerDb.nomUsager
      const requete = usagerDb.requete || {}
      const fingerprintPkNouveau = requete.fingerprintPk
      // console.debug("UpdateCertificat getInfoUsager pour %s", nomUsager)
      workers.connexion.getInfoUsager(nomUsager, {hostname: window.location.hostname, fingerprintPkNouveau})
        .then(async infoVersionReponse => {
          // console.debug("UpdateCertificat Reception infoVersion : ", infoVersionReponse)
          if(infoVersionReponse.ok === true) {
            const infoUsager = usagerWebAuth.infoUsager?{...usagerWebAuth.infoUsager}:{}
            const compte = infoVersionReponse.compte

            // Verifier reception de nouveau certificat en attachement
            // Mettre a jour usagerDb directement si certificat match
            if(infoVersionReponse['__original'].attachements && infoVersionReponse['__original'].attachements.certificat) {
              const messageCertificat = infoVersionReponse['__original'].attachements.certificat
              const contenuMessageCertificat = JSON.parse(messageCertificat.contenu)
              if(contenuMessageCertificat.chaine_pem) {
                console.info("Nouveau certificat recu en attachement")
                const {chaine_pem, fingerprint} = contenuMessageCertificat
                // S'assurer que le fingerprint match celui de la requete
                if(fingerprintPkNouveau === fingerprint) {
                  console.debug("Certificat match requete, on conserve")
                  const { clePriveePem, fingerprintPk } = requete
                  const dataAdditionnel = {
                    clePriveePem, fingerprintPk, 
                    delegations_version: compte.delegations_version,
                    delegations_date: compte.delegations_date,
                  }
                  await sauvegarderCertificatPem(nomUsager, chaine_pem, dataAdditionnel)

                  // Mettre a jour l'information de l'usager DB
                  const infoMaj = await workers.usagerDao.getUsager(nomUsager)
                  setUsagerDb(infoMaj)
                }
              }
            }


            infoUsager.delegations_version = 0  // Evite une boucle infinie en cas de reponse sans delegations_version
            Object.assign(infoUsager, infoVersionReponse.compte)
            setUsagerWebAuth({...usagerWebAuth, infoUsager})
          }
        })
        .catch(erreurCb)
    }
    // console.debug("UpdateCertificat obsolete %s : db=%s", obsolete, versionDb)

    return obsolete
  }, [workers, disabled, usagerDb, setUsagerDb, usagerWebAuth, setUsagerWebAuth, erreurCb])

  const confirmationCertificatCb = useCallback( resultat => {
      // console.debug("UpdateCertificat Resultat update certificat : %O", resultat)
      const nomUsager = usagerDb.nomUsager
      const requete = usagerDb.requete
      const compte = usagerWebAuth.infoUsager
      if(resultat.ok) {
        const { clePriveePem, fingerprintPk } = requete
        const dataAdditionnel = {
          clePriveePem, fingerprintPk, 
          delegations_version: compte.delegations_version,
          delegations_date: compte.delegations_date,
        }
        sauvegarderCertificatPem(nomUsager, resultat.certificat, dataAdditionnel)
          .then( async ()=>{
            if(confirmationCb) confirmationCb('Certificat mis a jour')

            // Mettre a jour l'information de l'usager DB
            const infoMaj = await workers.usagerDao.getUsager(nomUsager)
            setUsagerDb(infoMaj)
            
            // Reconnecter avec le nouveau certificat
            await workers.connexion.reconnecter()
            await workers.connexion.onConnect()
          })
          .catch(erreurCb)
      } else {
        erreurCb('Erreur mise a jour certificat : ' + resultat.err)
      }
  }, [workers, usagerDb, setUsagerDb, usagerWebAuth, confirmationCb, erreurCb])

  // Generer un nouveau CSR au besoin
  useEffect(()=>{
    if(versionObsolete) {
        console.debug("UpdateCertificat (usager: %O)", usagerDb)

        const requete = usagerDb.requete || {}
        if(!requete.fingerprintPk) {
          // console.debug("UpdateCertificat Generer nouveau certificat pour ", usagerDb)
          const nomUsager = usagerDb.nomUsager
          preparerNouveauCertificat(workers, nomUsager)
            .then(async nouvellesCles => {
                // console.debug("UpdateCertificat Cle challenge/csr : %O", nouvellesCles)
                if(nouvellesCles) {
                  const {csr, clePriveePem, fingerprint_pk} = nouvellesCles.cleCsr
                  const requete = {csr, clePriveePem, fingerprintPk: fingerprint_pk}
                  await workers.usagerDao.updateUsager(nomUsager, {nomUsager, requete})
                  setUsagerDb({...usagerDb, requete})
                }
            })
            .catch(erreurCb)
        }
    }
  }, [workers, versionObsolete, usagerDb, setUsagerDb, erreurCb, disabled])

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

