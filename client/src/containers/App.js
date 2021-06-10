import React, {useState, useEffect, useCallback, Suspense} from 'react'
import {Container, Alert} from 'react-bootstrap'
import {proxy as comlinkProxy} from 'comlink'
import Authentifier from './Authentifier'
import Layout from './Layout'

import '../components/i18n'

const AccueilUsager = React.lazy(_=>import('./AccueilUsager'))

// Methodes et instances gerees hors des lifecycle react
var _connexionWorker,
    _chiffrageWorker
    // _connexionInstance,
    // _chiffrageInstance

// window.onbeforeunload = cleanupApp

export default function App(props) {

  const [err, setErr] = useState('')
  const [workers, setWorkers] = useState('')
  const [infoIdmg, setInfoIdmg] = useState('')
  const [connecte, setConnecte] = useState(false)
  const [etatProtege, setEtatProtege] = useState(false)
  const [nomUsager, setNomUsager] = useState('')
  const [infoUsager, setInfoUsager] = useState('')

  const changerInfoUsager = useCallback( infoUsager => {
    console.debug("Nouveau info usager : %O", infoUsager)
    setInfoUsager(infoUsager)
    const nomUsager = infoUsager.nomUsager || ''
    setNomUsager(nomUsager)
  }, [])

  useEffect( _ => {
    init(setWorkers, setInfoIdmg, setConnecte, setEtatProtege, changerInfoUsager)
  }, [changerInfoUsager] )

  const _initialiserClesWorkers = useCallback(async _nomUsager=>{
    await initialiserClesWorkers(_nomUsager, _chiffrageWorker, _connexionWorker)
  }, [])

  const deconnecter = useCallback(async _=> {
    _deconnecter(setInfoIdmg, changerInfoUsager, setConnecte, setEtatProtege)
  }, [])

  const rootProps = {
    connecte, infoIdmg, etatProtege, nomUsager,
    setErr, deconnecter,
  }

  let contenu
  if(!workers) {
    contenu = <p>Chargement de la page</p>
  } else if(!nomUsager) {
    // Authentifier
    contenu = (
      <Authentifier workers={workers}
                    rootProps={rootProps}
                    initialiserClesWorkers={_initialiserClesWorkers}
                    setInfoUsager={changerInfoUsager} />
    )
  } else {
    contenu = (
      <AccueilUsager workers={workers}
                     rootProps={rootProps} />
    )
  }

  return (
    <Layout rootProps={rootProps}>

      <AlertError err={err} />

      <Suspense fallback={ChargementEnCours}>
        <Container className="contenu">
          {contenu}
        </Container>
      </Suspense>

    </Layout>
  )

}

function ChargementEnCours(props) {
  return (
    <p>Chargement en cours</p>
  )
}

function AlertError(props) {
  return (
    <Alert show={props.err?true:false} closeable>
      <Alert.Heading>Erreur</Alert.Heading>
      <pre>{props.err}</pre>
    </Alert>
  )
}

// setWorkers, setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege
async function init(setWorkers, setInfoIdmg, setConnecte, setEtatProtege, changerInfoUsager) {
  // Preparer workers
  await initialiserWorkers(setWorkers)

  // Verifier si on a deja une session - initialise session au besoin (requis pour socket.io)
  const infoUsager = await verifierSession()
  const nomUsager = infoUsager.nomUsager
  if(nomUsager) {
    console.debug("Session existante pour usager : %s", nomUsager)
    await initialiserClesWorkers(nomUsager, _chiffrageWorker, _connexionWorker)
  }

  await connecterSocketIo(setInfoIdmg, changerInfoUsager, setConnecte, setEtatProtege)

  if('storage' in navigator && 'estimate' in navigator.storage) {
    navigator.storage.estimate().then(estimate=>{
      console.debug("Estime d'espace de storage : %O", estimate)
    })
  }
}

async function initialiserWorkers(setWorkers) {
  const {
    setupWorkers,
    // cleanupWorkers,
  } = require('../workers/workers.load')
  // _cleanupWorkers = cleanupWorkers

  console.debug("Setup workers")
  const {chiffrage, connexion} = await setupWorkers()

  console.debug("Workers initialises : \nchiffrage %O, \nconnexion %O", chiffrage, connexion)

  // Conserver reference globale vers les workers/instances
  _connexionWorker = connexion.webWorker
  // _connexionInstance = connexion.workerInstance
  _chiffrageWorker = chiffrage.webWorker
  // _chiffrageInstance = chiffrage.workerInstance

  const workers = {connexion: _connexionWorker, chiffrage: _chiffrageWorker}
  setWorkers(workers)
}

async function verifierSession() {
  /* Verifier l'etat de la session usager. Va aussi creer le cookie de session
     (au besoin). Requis avant la connexion socket.io. */
  const axios = await import('axios')
  try {
    const reponseUser = await axios.get('/millegrilles/authentification/verifier')
    console.debug("User response : %O", reponseUser)
    const headers = reponseUser.headers

    const userId = headers['user-id']
    const nomUsager = headers['user-name']

    return {userId, nomUsager}
  } catch(err) {
    if(err.isAxiosError && err.response.status === 401) {
      return false
    }
    console.error("Erreur verif session usager : %O", err)
    return false
  }
}

// async function initialiser(setUserId, setNomUsager) {
//   /* Charger les workers */
//   const {preparerWorkersAvecCles} = require('../workers/workers.load')
//
//   console.debug("Verifier authentification (confirmation du serveur)")
//   const axios = await import('axios')
//   const promiseAxios = axios.get('/millegrilles/authentification/verifier')
//
//   const reponseUser = await promiseAxios
//   console.debug("Info /verifier axios : %O", reponseUser)
//   const headers = reponseUser.headers
//
//   const userId = headers['user-id']
//   const nomUsager = headers['user-name']
//
//   if(nomUsager) {
//     console.debug("Preparer workers avec cles pour usager : %s", nomUsager)
//
//     setUserId(userId)
//     setNomUsager(nomUsager)
//     await preparerWorkersAvecCles(nomUsager, [_chiffrageWorker, _connexionWorker])
//     console.debug("Cles pour workers pretes")
//
//     // connexion.webWorker.connecter()
//     // connexion.webWorker.socketOn('connect', listenersConnexion.reconnectSocketIo)
//     // connexion.webWorker.socketOn('modeProtege', setEtatProtege)
//
//     const infoCertificat = await _connexionWorker.getCertificatFormatteur()
//     setNiveauxSecurite(infoCertificat.extensions.niveauxSecurite)
//
//   } else {
//     console.debug("Usage non-authentifie, initialisation workers incomplete")
//   }
// }

async function initialiserClesWorkers(nomUsager, chiffrageWorker, connexionWorker) {
  try {
    const {preparerWorkersAvecCles} = require('../workers/workers.load')
    await preparerWorkersAvecCles(nomUsager, [chiffrageWorker, connexionWorker])
    console.debug("Cles pour workers initialisees")
  } catch(err) {
    console.warn("Erreur init db usager : %O", err)
  }
}

async function connecterSocketIo(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege) {

  const infoIdmg = await _connexionWorker.connecter({location: window.location.href})
  console.debug("Connexion socket.io completee, info idmg : %O", infoIdmg)
  // this.setState({...infoIdmg, connecte: true})
  setInfoIdmg(infoIdmg)
  setInfoUsager(infoIdmg)
  setConnecte(true)

  _connexionWorker.socketOn('disconnect', comlinkProxy(_ =>{
    setEtatProtege(false)
    setConnecte(false)
  }))

  _connexionWorker.socketOn('connect', comlinkProxy(_ =>{
    setConnecte(true)
  }))

  _connexionWorker.socketOn('modeProtege', comlinkProxy(reponse => {
    console.debug("Toggle mode protege, nouvel etat : %O", reponse)
    const modeProtege = reponse.etat
    setEtatProtege(modeProtege)
  }))

}

async function _deconnecter(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege) {
  setInfoIdmg('')
  setInfoUsager('')  // Reset aussi nomUsager

  // Deconnecter socket.io pour detruire la session, puis reconnecter pour login
  await _connexionWorker.deconnecter()
  await _chiffrageWorker.clearInfoSecrete()

  // Forcer l'expulsion de la session de l'usager
  const axios = await import('axios')
  await axios.get('/millegrilles/authentification/fermer')

  // Preparer la prochaine session (avec cookie)
  await axios.get('/millegrilles/authentification/verifier')
    .catch(err=>{/*Erreur 401 - OK*/})
  await connecterSocketIo(setInfoIdmg, setConnecte, setEtatProtege)
}

function _setTitre(titre) {
  document.title = titre
}
