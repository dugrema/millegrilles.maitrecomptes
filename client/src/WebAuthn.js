import {useState, useEffect, useCallback} from 'react'
import Button from 'react-bootstrap/Button'

import { repondreRegistrationChallenge } from '@dugrema/millegrilles.reactjs'

export function BoutonAjouterWebauthn(props) {

    const { workers, variant, className, usagerDbLocal, resetMethodes, confirmationCb, erreurCb } = props
    const { connexion } = workers
    const nomUsager = usagerDbLocal.nomUsager,
          fingerprintPk = usagerDbLocal.fingerprint_pk

    const [challenge, setChallenge] = useState('')

    const onClickCb = useCallback(()=>{
        ajouterMethode(connexion, nomUsager, fingerprintPk, challenge, resetMethodes)
            .then(()=>confirmationCb('Methode ajoutee avec succes'))
            .catch(err=>erreurCb(err, 'Erreur ajouter methode'))
    }, [connexion, nomUsager, fingerprintPk, challenge, resetMethodes])

    useEffect(
        () => {
            getChallengeAjouter(connexion, setChallenge)
               .catch(err=>erreurCb(err, 'Erreur preparation challenge pour ajouter methode'))
        },
        [connexion, setChallenge]
    )

    return (
        <Button 
            variant={variant} 
            className={className} 
            onClick={onClickCb}
            disabled={challenge?false:true}
        >
            {props.children}
        </Button>
    )

}

async function getChallengeAjouter(connexion, setChallenge) {
    console.debug("Charger challenge ajouter webauthn")
    const challenge = await connexion.declencherAjoutWebauthn()
    console.debug("Challenge : %O", challenge)
    setChallenge(challenge)
}

async function ajouterMethode(connexion, nomUsager, fingerprintPk, challenge, resetMethodes) {
    console.debug("Ajouter webauthn pour usager %s", nomUsager)

    // NB : Pour que l'enregistrement avec iOS fonctionne bien, il faut que la
    //      thread de l'evenement soit la meme que celle qui declenche
    //      navigator.credentials.create({publicKey}) sous repondreRegistrationChallenge
    const reponse = await repondreRegistrationChallenge(nomUsager, challenge)
    console.debug("Reponse ajout webauthn : %O", reponse)

    const params = {
        reponseChallenge: reponse,
        fingerprintPk,
    }

    if(resetMethodes) {
        params.desactiverAutres = true
    }

    console.debug("reponseChallenge : %O", params)

    const resultatAjout = await connexion.repondreChallengeRegistrationWebauthn(params)
    console.debug("Resultat ajout : %O", resultatAjout)
    if(resultatAjout !== true) throw new Error("Erreur, ajout methode refusee (back-end)")
}

// export function ModalAjouterWebauthn(props) {

//     // const [complete, setComplete] = useState(false)
//     const [err, setErr] = useState('')
//     const [challenge, setChallenge] = useState('')
//     const [fingerprintPk, setFingerprintPk] = useState('')
  
//     const succes = _ => {
//       props.setComplete(true)
//       // setTimeout(props.hide, 3000)
//     }
  
//     const {show} = props
//     const connexion = props.workers.connexion
//     const {nomUsager} = props.rootProps
  
//     useEffect( _ => {
//       const doasync = async _ => {
//         if(show) {
//           console.debug("Activer registration webauthn pour %s", nomUsager)
//           const challenge = await connexion.declencherAjoutWebauthn()
//           const usager = await getUsager(nomUsager)
//           const fingerprintPk = await usager.fingerprint_pk
//           console.debug("Resultat fingerprintPk : %s", fingerprintPk)
//           setFingerprintPk(fingerprintPk)
//           setChallenge(challenge)
//           setErr('')
//           // setComplete(false)
//         }
//       }
//       doasync().catch(err=>{console.error("Erreur enregistrement cle avec webauthn", err)})
//     }, [show, nomUsager, connexion])
  
//     const enregistrer = async event => {
//       try {
//         const nomUsager = props.rootProps.nomUsager
  
//         // NB : Pour que l'enregistrement avec iOS fonctionne bien, il faut que la
//         //      thread de l'evenement soit la meme que celle qui declenche
//         //      navigator.credentials.create({publicKey}) sous repondreRegistrationChallenge
//         const reponseChallenge = await repondreRegistrationChallenge(nomUsager, challenge, {DEBUG: true})
  
//         const params = {
//           // desactiverAutres: this.state.desactiverAutres,
//           reponseChallenge,
//           fingerprintPk,
//         }
  
//         if(props.resetMethodes) {
//           params.desactiverAutres = true
//         }
  
//         console.debug("reponseChallenge : %O", params)
  
//         const resultatAjout = await connexion.repondreChallengeRegistrationWebauthn(params)
//         console.debug("Resultat ajout : %O", resultatAjout)
//         succes()
//       } catch(err) {
//         console.error("Erreur auth : %O", err)
//         setErr(''+err)
//       }
//     }
  
//     return (
//       <Modal show={props.show} onHide={props.hide}>
//         <Modal.Header closeButton>Ajouter methode d'authentification</Modal.Header>
//         <Modal.Body>
  
//           <Alert variant="danger" show={err?true:false}>
//             <p>Une erreur est survenue.</p>
//             <p>{err}</p>
//           </Alert>
  
//           {(!err)?
//             <p>Cliquez sur suivant et suivez les instructions qui vont apparaitre a l'ecran ... </p>
//             :''
//           }
  
//           <Button disabled={!challenge} onClick={enregistrer}>Suivant</Button>
//           <Button variant="secondary" onClick={props.hide}>Annuler</Button>
  
//         </Modal.Body>
//       </Modal>
//     )
// }