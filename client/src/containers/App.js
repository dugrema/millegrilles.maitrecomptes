import React, {useState, useEffect, useCallback, Suspense} from 'react'
import {Container, Alert} from 'react-bootstrap'
import {proxy as comlinkProxy} from 'comlink'

import Authentifier, {AlertReauthentifier, entretienCertificat} from './Authentifier'
import Layout from './Layout'

import '../components/i18n'
import './App.css'

const AccueilUsager = React.lazy( _ => import('./AccueilUsager') )

// Methodes et instances gerees hors des lifecycle react
var _connexionWorker,
    _chiffrageWorker

export default function App(props) {

  const [err, setErr] = useState('')
  const [workers, setWorkers] = useState('')
  const [dateChargementCle, setDateChargementCle] = useState('')  // Date de reload cle/certificat
  const [infoIdmg, setInfoIdmg] = useState('')
  const [connecte, setConnecte] = useState(false)
  const [etatProtege, setEtatProtege] = useState(false)
  const [nomUsager, setNomUsager] = useState('')
  const [infoUsager, setInfoUsager] = useState('')
  const [errConnexion, setErrConnexion] = useState(false)
  const [page, setPage] = useState('')

  const changerPage = useCallback( valeur => {
    if(valeur.currentTarget) valeur = valeur.currentTarget.value
    setPage(valeur)
  }, [])

  const changerInfoUsager = useCallback( infoUsager => {
    console.debug("Nouveau info usager : %O", infoUsager)
    setInfoUsager(infoUsager)
    const nomUsager = infoUsager.nomUsager || ''

    setNomUsager(nomUsager)

    if(nomUsager) {
      _connexionWorker.socketOff('connect')
      _connexionWorker.socketOn('connect', comlinkProxy(_ =>{
        // Utilise pour les reconnexions seulement (connect initial est manque)
        reconnecter(nomUsager, setConnecte, setInfoUsager, setErrConnexion)
      }))

      const workers = {
        chiffrage: _chiffrageWorker,
        connexion: _connexionWorker,
      }

      // S'assurer que le certificat local existe, renouveller au besoin
      console.debug("Entretien certificats de %s", nomUsager)
      entretienCertificat(workers, nomUsager, infoUsager).then(async _ => {
        initialiserClesWorkers(nomUsager, workers, setDateChargementCle)
      }).catch(err=>{
        console.error("Erreur initialisation certificat ou cle workers %O", err)
      })
    }
  }, [])

  const changerErrConnexion = useCallback( errConnexion => {
    console.warn("Erreur de connexion? %s", errConnexion)
    setErrConnexion(errConnexion)
    // Reset information usager
    let infoIdmgUpdate = {idmg: infoIdmg.idmg}
    setInfoIdmg(infoIdmgUpdate)
    setInfoUsager('')
  }, [infoIdmg, setErrConnexion, setInfoIdmg, setInfoUsager])

  // Hook changement usager
  useEffect( _ => {
    init(setWorkers, setInfoIdmg, setConnecte, setEtatProtege, changerInfoUsager, setDateChargementCle, changerErrConnexion)
      .catch(err=>{console.error("Erreur init : %O", err)})
  }, [changerInfoUsager, changerErrConnexion] )

  const _initialiserClesWorkers = useCallback(async _nomUsager=>{
    console.debug("_initialiserClesWorkers : %O, %O", _nomUsager, workers)
    initialiserClesWorkers(_nomUsager, workers, setDateChargementCle)
      .catch(err=>{
        console.warn("Erreur initialiser cles workers : %O", err)
      })
  }, [workers])

  const deconnecter = useCallback(async _=> {
    _deconnecter(setInfoIdmg, changerInfoUsager, setConnecte, setEtatProtege, changerErrConnexion)
      .catch(err=>{console.warn("Erreur dans deconnecter : %O", err)})
  }, [changerInfoUsager, changerErrConnexion])

  const rootProps = {
    connecte, infoIdmg, etatProtege, nomUsager, dateChargementCle,
    initialiserClesWorkers: _initialiserClesWorkers,
    setPage: changerPage, setErr, deconnecter,
  }

  let contenu
  if( ! workers || connecte === false || infoIdmg === '' ) {
    contenu = <p>Chargement de la page ...</p>
  } else if(!nomUsager) {
    // Authentifier
    contenu = (
      <Authentifier workers={workers}
                    rootProps={rootProps}
                    infoIdmg={infoIdmg}
                    initialiserClesWorkers={_initialiserClesWorkers}
                    setInfoUsager={changerInfoUsager}
                    confirmerAuthentification={changerInfoUsager} />
    )
  } else {
    contenu = (
      <>
        <AlertConnexionPerdue show={!connecte} />

        <AlertReauthentifier show={connecte && !etatProtege}
                             nomUsager={nomUsager}
                             infoUsager={infoUsager}
                             workers={workers}
                             confirmerAuthentification={changerInfoUsager} />

        <AccueilUsager workers={workers}
                       rootProps={rootProps}
                       page={page} />
      </>
    )
  }

  return (
    <Layout rootProps={rootProps} infoIdmg={infoIdmg}>

      <Suspense fallback={<ChargementEnCours />}>
        <Container className="contenu">
          <AlertError err={err} close={()=>setErr('')} />
          <AlertError err={errConnexion} close={()=>setErrConnexion('')}  />

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
    <Alert show={props.err?true:false} dismissible onClose={props.close}>
      <Alert.Heading>Erreur</Alert.Heading>
      <pre>{props.err}</pre>
    </Alert>
  )
}

function AlertConnexionPerdue(props) {
  return (
    <Alert variant="danger" show={props.show}>
      <Alert.Heading>Connexion perdue</Alert.Heading>
    </Alert>
  )
}

async function init(
  setWorkers, setInfoIdmg, setConnecte, setEtatProtege,
  changerInfoUsager, setDateChargementCle, setErrConnexion
) {
  // Preparer workers
  await initialiserWorkers(setWorkers)

  const {infoIdmg} = await connecterSocketIo(
      setInfoIdmg, changerInfoUsager, setConnecte, setEtatProtege, setErrConnexion)
  console.debug("Connexion socket.io infoIdmg: %O", infoIdmg)

  const nomUsager = infoIdmg?infoIdmg.nomUsager:''
  if(nomUsager) {
    console.debug("Session existante pour usager : %s", nomUsager)
    await initialiserClesWorkers(
      nomUsager,
      {chiffrage: _chiffrageWorker, connexion: _connexionWorker},
      setDateChargementCle
    ).catch(err=>{console.warn("Erreur initialiseCleWorkers %O", err)})

    // Tenter de reconnecter les listeners proteges
    await reconnecter(nomUsager, setConnecte, changerInfoUsager, setErrConnexion)
  }

  if('storage' in navigator && 'estimate' in navigator.storage) {
    navigator.storage.estimate().then(estimate=>{
      console.debug("Estime d'espace de storage : %O", estimate)
    })
  }
}

async function initialiserWorkers(setWorkers) {
  if(_connexionWorker === undefined && _chiffrageWorker === undefined) {
    // Initialiser une seule fois
    _connexionWorker = false
    _chiffrageWorker = false

    const { setupWorkers } = require('../workers/workers.load')

    console.debug("Setup workers")
    const {chiffrage, connexion} = await setupWorkers()
    // Conserver reference globale vers les workers/instances
    _connexionWorker = connexion.webWorker
    _chiffrageWorker = chiffrage.webWorker

    const workers = {connexion: _connexionWorker, chiffrage: _chiffrageWorker}
    setWorkers(workers)

    console.debug("Workers initialises : \nchiffrage %O, \nconnexion %O", chiffrage, connexion)
  } else {
    console.debug("Tenter init workers, deja en cours")
  }
}

async function verifierSession() {
  /* Verifier l'etat de la session usager. Va aussi creer le cookie de session
     (au besoin). Requis avant la connexion socket.io. */
  const axios = await import('axios')
  try {
    const reponseUser = await axios.get('/millegrilles/authentification/verifier')
    console.debug("User response : %O", reponseUser)
    const headers = reponseUser.headers

    const userId = headers['x-user-id']
    const nomUsager = headers['x-user-name']

    return {userId, nomUsager}
  } catch(err) {
    if(err.isAxiosError && err.response.status === 401) { return false }
    console.error("Erreur verif session usager : %O", err)
    return false
  }
}

async function initialiserClesWorkers(nomUsager, workers, setDateChargementCle) {
  const {preparerWorkersAvecCles} = require('../workers/workers.load')
  await preparerWorkersAvecCles(nomUsager, [workers.chiffrage, workers.connexion])
  setDateChargementCle(new Date())
  console.debug("Cles pour workers initialisees")
}

async function connecterSocketIo(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege, setErrConnexion) {

  // S'assurer que la session est creee - attendre reponse
  if(!_connexionWorker) throw new Error("Connexion worker n'est pas initialise")

  // Note : connexion socket.io est pure wss, on n'a pas de piggy-back pour
  //        recuperer le cookie de session.

  // Initialiser une premiere connexion via https pour permettre au navigateur
  // de recuperer le cookie de session.
  await verifierSession()

  const infoIdmg = await _connexionWorker.connecter({location: window.location.href})
    .catch(err=>{
      if(err.socketOk) {
        console.info("connecterSocketIo invoque sur socket deja ouvert")
      } else {
        throw err
      }
    })
  console.debug("Connexion socket.io completee, info idmg : %O", infoIdmg)
  setInfoIdmg(infoIdmg)
  setConnecte(true)

  _connexionWorker.socketOn('disconnect', comlinkProxy(_ =>{
    console.debug("Deconnexion (modeProtege=false, connecte=false)")
    setEtatProtege(false)
    setConnecte(false)
  }))

  _connexionWorker.socketOn('modeProtege', comlinkProxy(reponse => {
    console.debug("Toggle mode protege, nouvel etat : %O", reponse)
    const modeProtege = reponse.etat
    setEtatProtege(modeProtege)
  }))

  return { infoIdmg }
}

async function reconnecter(nomUsager, setConnecte, setInfoUsager, setErrConnexion) {
  console.debug("Reconnexion usager %s", nomUsager)
  if(!nomUsager) {
    console.warn("Erreur reconnexion, nom usager non defini")
    setErrConnexion(true)
  }
  setConnecte(true)

  const infoUsager = await _connexionWorker.getInfoUsager(nomUsager)
  console.debug("Information usager recue sur reconnexion : %O", infoUsager)

  const challengeCertificat = infoUsager.challengeCertificat

  // Emettre demander d'authentification secondaire - va etre accepte
  // si la session est correctement initialisee.
  try {
    const messageFormatte = await _chiffrageWorker.formatterMessage(
      challengeCertificat, 'signature', {attacherCertificat: true})

    const resultat = await _connexionWorker.authentifierCertificat(messageFormatte)
    setInfoUsager(resultat)
    console.debug("Resultat reconnexion %O", resultat)
  } catch(err) {
    console.warn("Erreur de reconnexion : %O", err)
    setErrConnexion('Erreur de reconnexion automatique')
  }
}

async function _deconnecter(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege, setErrConnexion) {
  setInfoIdmg('')
  setInfoUsager('')  // Reset aussi nomUsager

  // Deconnecter socket.io pour detruire la session, puis reconnecter pour login
  await _connexionWorker.deconnecter()
  await _chiffrageWorker.clearInfoSecrete()

  // Forcer l'expulsion de la session de l'usager
  const axios = await import('axios')
  await axios.get('/millegrilles/authentification/fermer')

  // Preparer la prochaine session (avec cookie)
  await connecterSocketIo(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege, setErrConnexion)
}

// async function callbackChallengeCertificat(challenge, cb) {
//   /* Utilise pour repondre a une connexion / reconnexion socket.io */
//   console.debug("callbackChallengeCertificat challenge=%O", challenge)
//   try {
//     const challengeExtrait = {
//       date: challenge.challengeCertificat.date,
//       data: challenge.data,
//     }
//
//     if(_chiffrageWorker) {
//
//       const messageFormatte = await _chiffrageWorker.formatterMessage(
//         challengeExtrait, 'signature', {attacherCertificat: true})
//
//       console.debug("Reponse challenge callback %O", messageFormatte)
//       cb(messageFormatte)
//       return
//     }
//   } catch(err) {
//     console.warn("Erreur traitement App.callbackChallenge : %O", err)
//   }
//   cb({err: 'Refus de repondre'})
// }

// function _setTitre(titre) {
//   document.title = titre
// }
