import {useState, useEffect, useCallback} from 'react'
import Button from 'react-bootstrap/Button'
import multibase from 'multibase'

import { CONST_COMMANDE_AUTH, CONST_COMMANDE_SIGNER_CSR } from '@dugrema/millegrilles.utiljs/src/constantes'
import { usagerDao, repondreRegistrationChallenge } from '@dugrema/millegrilles.reactjs'
import { hacherMessage } from '@dugrema/millegrilles.utiljs/src/formatteurMessage'

import { sauvegarderCertificatPem, genererCle } from './comptesUtil'

export function BoutonAjouterWebauthn(props) {

    const { workers, variant, className, usagerDbLocal, resetMethodes, confirmationCb, erreurCb } = props
    const { connexion } = workers
    const nomUsager = usagerDbLocal.nomUsager,
          fingerprintPk = usagerDbLocal.fingerprintPk

    const [challenge, setChallenge] = useState('')

    const onClickCb = useCallback(event=>{
        event.preventDefault()
        event.stopPropagation()
        ajouterMethode(connexion, nomUsager, fingerprintPk, challenge, resetMethodes)
            .then(()=>confirmationCb('Methode ajoutee avec succes'))
            .catch(err=>erreurCb(err, 'Erreur ajouter methode'))
    }, [connexion, nomUsager, fingerprintPk, challenge, resetMethodes, confirmationCb, erreurCb])

    useEffect(
        () => {
            getChallengeAjouter(connexion, setChallenge)
               .catch(err=>erreurCb(err, 'Erreur preparation challenge pour ajouter methode'))
        },
        [connexion, setChallenge, erreurCb]
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

export function BoutonAuthentifierWebauthn(props) {

    const { workers, variant, className, usagerDbLocal, challenge, erreurCb, setResultatAuthentificationUsager } = props
    const { connexion } = workers
    const { nomUsager, requete: requeteCsr } = usagerDbLocal

    const [reponseChallengeAuthentifier, setReponseChallengeAuthentifier] = useState('')
    const [attente, setAttente] = useState(false)

    const authentifierCb = useCallback( event => {
        console.debug("Authentifier")
        setAttente(true)
        const {demandeCertificat, publicKey} = reponseChallengeAuthentifier
        authentifier(connexion, nomUsager, challenge, demandeCertificat, publicKey)
            .then(reponse=>setResultatAuthentificationUsager(reponse))
            .catch(err=>erreurCb(err, 'Erreur authentification'))
            .finally(()=>{setAttente(false)})
    }, [connexion, nomUsager, challenge, reponseChallengeAuthentifier, setResultatAuthentificationUsager, setAttente, erreurCb])

    useEffect(()=>{
        preparerAuthentification(nomUsager, challenge, requeteCsr)
            .then(resultat=>setReponseChallengeAuthentifier(resultat))
            .catch(err=>erreurCb(err, 'Erreur preparation authentification'))
    }, [nomUsager, challenge, requeteCsr, setReponseChallengeAuthentifier, erreurCb])

    let attenteIcon = ''
    if(attente) attenteIcon = <i className="fa fa-spinner fa-spin fa-fw" />

    return (
        <Button 
            variant={variant} 
            className={className} 
            onClick={authentifierCb}
            disabled={challenge?false:true}
        >
            {props.children}
            {attenteIcon}
        </Button>
    )
}

export function BoutonMajCertificatWebauthn(props) {

    const { 
        workers, variant, className, usagerDbLocal, setUsagerDbLocal, challenge, 
        setAttente, confirmationCb, erreurCb,
    } = props
    const { nomUsager } = usagerDbLocal

    const [nouvelleCleCsr, setNouvelleCleCsr] = useState('')

    const majCertificatCb = useCallback(()=>{
        if(setAttente) setAttente(true)
        const cleCsr = nouvelleCleCsr.cleCsr
        const {demandeCertificat, publicKey} = nouvelleCleCsr.reponseChallengeAuthentifier
        majCertificat(workers, nomUsager, challenge, demandeCertificat, publicKey, cleCsr, setUsagerDbLocal)
            .then(()=>{if(confirmationCb) confirmationCb('Nouveau certificat recu.')})
            .catch(err=>{if(erreurCb) erreurCb(err); else console.error("Erreur : %O", err)})
            .finally(()=>{if(setAttente) setAttente(false)})
    }, [
        workers, nomUsager, nouvelleCleCsr, setUsagerDbLocal, 
        challenge, setAttente, confirmationCb, erreurCb
    ])

    // Preparer csr, cle, preuve a signer
    useEffect(()=>{
        if(!nouvelleCleCsr) {
            preparerNouveauCertificat(workers, nomUsager)
                .then(cle=>{
                    // console.debug("Cle challenge/csr : %O", cle)
                    setNouvelleCleCsr(cle)
                })
                .catch(err=>erreurCb(err))
        }
    }, [workers, nomUsager, nouvelleCleCsr, setNouvelleCleCsr, erreurCb])

    return (
        <Button 
            variant={variant} 
            className={className} 
            onClick={majCertificatCb}
            disabled={nouvelleCleCsr?false:true}>
            {props.children}
        </Button>
    )
}

async function preparerNouveauCertificat(workers, nomUsager) {
    const {connexion} = workers
    const cleCsr = await genererCle(nomUsager)
    // console.debug("Nouvelle cle generee : %O", cleCsr)
    // const csr = cleCsr.csr

    const infoUsager = await connexion.getInfoUsager(nomUsager)
    // console.debug("Etat usager backend : %O", infoUsager)
    const challenge = infoUsager.challengeWebauthn
    if(!challenge) return null

    const reponseChallengeAuthentifier = await preparerAuthentification(nomUsager, challenge, cleCsr)
    
    return {cleCsr, challengeWebAuthn: challenge, reponseChallengeAuthentifier}
}

async function majCertificat(workers, nomUsager, challenge, demandeCertificat, publicKey, cleCsr, setUsagerDbLocal) {
    const {connexion} = workers
    const reponse = await authentifier(connexion, nomUsager, challenge, demandeCertificat, publicKey)
    console.debug("Reponse nouveau certificat : %O", reponse)
    const certificat = reponse.certificat
    const {delegations_date, delegations_version} = reponse
    const {clePriveePem, fingerprintPk} = cleCsr
    await sauvegarderCertificatPem(nomUsager, certificat, {requete: null, fingerprintPk, clePriveePem, delegations_date, delegations_version})

    // Recharger le compte usager (db locale)
    // const usagerDbLocal = await usagerDao.getUsager(nomUsager)
    // Mettre a jour usager, trigger un reload complet incluant formatteur de messages
    await setUsagerDbLocal(await usagerDao.getUsager(nomUsager))
}

async function getChallengeAjouter(connexion, setChallenge) {
    // console.debug("Charger challenge ajouter webauthn")
    const challengeWebauthn = await connexion.declencherAjoutWebauthn()
    // console.debug("Challenge : %O", challengeWebauthn)
    setChallenge(challengeWebauthn)
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

async function preparerAuthentification(nomUsager, challengeWebauthn, requete) {
    const challenge = multibase.decode(challengeWebauthn.challenge)
    var allowCredentials = challengeWebauthn.allowCredentials
    if(allowCredentials) {
        allowCredentials = allowCredentials.map(item=>{
            return {...item, id: multibase.decode(item.id)}
        })
    }

    let demandeCertificat = null
    if(requete) {
        const csr = requete.csr
        // console.debug("On va hacher le CSR et utiliser le hachage dans le challenge pour faire une demande de certificat")
        // if(props.appendLog) props.appendLog(`On va hacher le CSR et utiliser le hachage dans le challenge pour faire une demande de certificat`)
        demandeCertificat = {
            nomUsager,
            csr,
            date: Math.floor(new Date().getTime()/1000)
        }
        const hachageDemandeCert = await hacherMessage(demandeCertificat, {bytesOnly: true, hashingCode: 'blake2b-512'})
        // console.debug("Hachage demande cert %O = %O", hachageDemandeCert, demandeCertificat)
        challenge[0] = CONST_COMMANDE_SIGNER_CSR
        challenge.set(hachageDemandeCert, 1)  // Override bytes 1-65 du challenge
        // console.debug("Challenge override pour demander signature certificat : %O", challenge)
        // if(props.appendLog) props.appendLog(`Hachage demande cert ${JSON.stringify(hachageDemandeCert)}`)
    } else if(challenge[0] !== CONST_COMMANDE_AUTH) {
        console.error("Challenge[0] : %d !== %d", challenge[0], CONST_COMMANDE_AUTH)
        throw new Error("Erreur challenge n'est pas de type authentification (code!==1)")
    }        

    const publicKey = {
        ...challengeWebauthn,
        challenge,
        allowCredentials,
    }

    const resultat = {publicKey, demandeCertificat}
    // console.debug("Prep publicKey/demandeCertificat : %O", resultat)
    
    return resultat
}

async function authentifier(connexion, nomUsager, challengeWebauthn, demandeCertificat, publicKey) {
    // N.B. La methode doit etre appelee par la meme thread que l'event pour supporter
    //      TouchID sur iOS.
    // console.debug("Signer challenge : %O (challengeWebauthn %O, opts: %O)", publicKey, challengeWebauthn, opts)
    // if(opts.appendLog) opts.appendLog(`Signer challenge`)

    if(!nomUsager) throw new Error("Nom usager manquant")  // Race condition ... pas encore trouve

    // S'assurer qu'on a un challenge de type 'authentification'
    // const demandeCertificat = opts.demandeCertificat?opts.demandeCertificat:null
    const data = {nomUsager, demandeCertificat}
    
    const publicKeyCredentialSignee = await navigator.credentials.get({publicKey})
    console.debug("PublicKeyCredential signee : %O", publicKeyCredentialSignee)
    // if(opts.appendLog) opts.appendLog(`PublicKeyCredential signee : ${JSON.stringify(publicKeyCredentialSignee)}`)

    try {
        let challengeSigne = {challenge: challengeWebauthn.challenge}
        challengeSigne = await connexion.formatterMessage(challengeSigne, 'signature', {attacherCertificat: true})
        data.signatureCertificat = challengeSigne
    } catch(err) {
        console.warn("Authentification - certificat non disponible, signature webauthn seulement", err)
    }

    const reponseSignee = publicKeyCredentialSignee.response

    const reponseSerialisable = {
        id: publicKeyCredentialSignee.rawId,
        id64: String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(publicKeyCredentialSignee.rawId))),
        response: {
        authenticatorData: reponseSignee.authenticatorData,
        clientDataJSON: reponseSignee.clientDataJSON,
        signature: reponseSignee.signature,
        userHandle: reponseSignee.userHandle,
        },
        type: publicKeyCredentialSignee.type,
    }

    console.debug("Reponse serialisable : %O", reponseSerialisable)

    data.webauthn = reponseSerialisable

    console.debug("Data a soumettre pour reponse webauthn : %O", data)
    const resultatAuthentification = await connexion.authentifierWebauthn(data)
    console.debug("Resultat authentification : %O", resultatAuthentification)

    if(resultatAuthentification.userId) {
        return resultatAuthentification
    } else {
        throw new Error("Erreur authentification")
    }
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