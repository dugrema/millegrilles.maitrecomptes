import {useState, useEffect, useCallback} from 'react'
import Button from 'react-bootstrap/Button'
import base64url from 'base64url'

import { usagerDao, BoutonActif } from '@dugrema/millegrilles.reactjs'
import { repondreRegistrationChallenge } from '@dugrema/millegrilles.reactjs/src/webauthn.js'
import { hacherMessage } from '@dugrema/millegrilles.reactjs/src/formatteurMessage'

import useWorkers from './WorkerContext'

import { sauvegarderCertificatPem, genererCle, chargerUsager } from './comptesUtil'

export function BoutonAjouterWebauthn(props) {

    const { variant, className, usagerDbLocal, resetMethodes, confirmationCb, erreurCb } = props

    const workers = useWorkers()

    const { connexion } = workers
    const nomUsager = usagerDbLocal.nomUsager,
          fingerprintPk = usagerDbLocal.fingerprintPk

    const [challenge, setChallenge] = useState('')
    const [resultat, setResultat] = useState('')

    const onClickCb = useCallback(event=>{
        setResultat('attente')
        event.preventDefault()
        event.stopPropagation()
        console.debug("Ajout methode pour nomUsager %s, fingerprintPk %O, challenge %O", nomUsager, fingerprintPk, challenge)
        ajouterMethode(connexion, nomUsager, fingerprintPk, challenge, resetMethodes, {DEBUG: true})
            .then( resultat => {
                console.debug("Resultat ajouter methode : ", resultat)
                setResultat('succes')
                if(confirmationCb) confirmationCb()
            })
            .catch(err=>{
                setResultat('echec')
                erreurCb(err, 'Erreur ajouter methode')
            })
    }, [connexion, nomUsager, fingerprintPk, challenge, resetMethodes, confirmationCb, erreurCb, setResultat])

    useEffect(() => {
            getChallengeAjouter(connexion, setChallenge)
               .catch(err=>erreurCb(err, 'Erreur preparation challenge pour ajouter methode'))
        },
        [connexion, setChallenge, confirmationCb, erreurCb]
    )

    return (
        <BoutonActif
            variant={variant} 
            className={className} 
            etat={resultat}
            onClick={onClickCb}
            disabled={challenge?false:true}
        >
            {props.children}
        </BoutonActif>
    )

}

export function BoutonAuthentifierWebauthn(props) {

    const { variant, className, usagerDbLocal, challenge, onError, onSuccess } = props

    const workers = useWorkers()

    const nomUsager = props.nomUsager || usagerDbLocal.nomUsager
    const { connexion } = workers
    const { requete: requeteCsr } = usagerDbLocal

    const [reponseChallengeAuthentifier, setReponseChallengeAuthentifier] = useState('')
    const [attente, setAttente] = useState(false)
    const [erreur, setErreur] = useState(false)
    const handlerErreur = useCallback((err, message)=>{
        setErreur(true)
        onError(err, message)
    }, [setErreur, onError])

    const authentifierCb = useCallback( event => {
        console.debug("BoutonAuthentifierWebauthn.authentifierCb Authentifier reponseChallengeAuthentifier: %O", reponseChallengeAuthentifier)
        setErreur(false)  // Reset
        setAttente(true)
        const {demandeCertificat, publicKey} = reponseChallengeAuthentifier
        authentifier(connexion, nomUsager, demandeCertificat, publicKey)
            .then(reponse=>{
                console.debug("BoutonAuthentifierWebauthn Reponse authentifier ", reponse)
                onSuccess(reponse)
            })
            .catch(err=>handlerErreur(err, 'BoutonAuthentifierWebauthn.authentifierCb Erreur authentification'))
            .finally(()=>{setAttente(false)})
    }, [connexion, nomUsager, reponseChallengeAuthentifier, onSuccess, setAttente, setErreur, handlerErreur])

    useEffect(()=>{
        if(!challenge) return
        preparerAuthentification(nomUsager, challenge, requeteCsr)
            .then(resultat=>setReponseChallengeAuthentifier(resultat))
            .catch(err=>onError(err, 'BoutonAuthentifierWebauthn.authentifierCb Erreur preparation authentification'))
    }, [nomUsager, challenge, requeteCsr, setReponseChallengeAuthentifier, onError])

    let etatBouton = ''
    if(erreur) etatBouton = 'echec'
    else if(attente) etatBouton = 'attente'

    return (
        <BoutonActif 
            variant={variant} 
            className={className} 
            etat={etatBouton}
            onClick={authentifierCb}
            disabled={reponseChallengeAuthentifier?false:true}
        >
            {props.children}
        </BoutonActif>
    )
}

export function BoutonMajCertificatWebauthn(props) {

    const { 
        variant, className, usager, setAttente, onSuccess, onError, setUsagerDbLocal,
    } = props

    const workers = useWorkers()

    const { nomUsager, requete } = usager

    // const [nouvelleCleCsr, setNouvelleCleCsr] = useState('')
    const [csrChallenge, setCsrChallenge] = useState('')

    const majCertificatCb = useCallback(()=>{
        if(setAttente) setAttente(true)
        console.debug("majCertificatCb requete : %O, csrChallenge: %O", requete, csrChallenge)
        const { demandeCertificat, publicKey } = csrChallenge
        majCertificat(workers, nomUsager, demandeCertificat, publicKey, requete, setUsagerDbLocal)
            .then(()=>{if(onSuccess) onSuccess('Nouveau certificat recu.')})
            .catch(err=>{if(onError) onError(err); else console.error("Erreur : %O", err)})
            .finally(()=>{if(setAttente) setAttente(false)})
    }, [
        workers, nomUsager, requete, csrChallenge,
        setAttente, setUsagerDbLocal, onSuccess, onError
    ])

    // Charger un nouveau challenge
    useEffect(()=>{
        chargerUsager(workers.connexion, nomUsager, null, null, {genererChallenge: true})
            .then(reponse=>{
                console.debug("BoutonMajCertificatWebauthn reponse generer challenge : ", reponse)
                return preparerAuthentification(nomUsager, reponse.infoUsager.authentication_challenge, requete)
            })
            .then(setCsrChallenge)
            .catch(onError)
    }, [workers, nomUsager, setCsrChallenge, onError])

    return (
        <Button 
            variant={variant} 
            className={className} 
            onClick={majCertificatCb}
            disabled={csrChallenge?false:true}>
            {props.children}
        </Button>
    )
}

export async function preparerNouveauCertificat(workers, nomUsager) {
    const {connexion} = workers
    const cleCsr = await genererCle(nomUsager)
    console.debug("Nouvelle cle generee : %O", cleCsr)

    const hostname = window.location.hostname
    const infoUsager = await connexion.getInfoUsager(nomUsager, {hostname, genererChallenge: true})
    console.debug("Etat usager backend : %O", infoUsager)
    const challenge = infoUsager.authentication_challenge
    if(!challenge) return null
    const reponseChallengeAuthentifier = await preparerAuthentification(nomUsager, challenge, cleCsr)
    
    return {cleCsr, challengeWebAuthn: challenge, reponseChallengeAuthentifier}
}

async function majCertificat(workers, nomUsager, demandeCertificat, publicKey, cleCsr, setUsagerDbLocal) {
    const {connexion} = workers
    const reponse = await authentifier(connexion, nomUsager, demandeCertificat, publicKey, {noformat: false})
    let contenu = reponse
    if(reponse.contenu) contenu = JSON.parse(reponse.contenu)
    console.debug("Reponse nouveau certificat : %O", contenu)
    const certificat = contenu.certificat
    const {delegations_date, delegations_version} = contenu
    const {clePriveePem, fingerprintPk} = cleCsr
    await sauvegarderCertificatPem(
        nomUsager, certificat, 
        {requete: null, fingerprintPk, clePriveePem, delegations_date, delegations_version}
    )

    // Recharger le compte usager (db locale)
    // const usagerDbLocal = await usagerDao.getUsager(nomUsager)
    // Mettre a jour usager, trigger un reload complet incluant formatteur de messages
    await setUsagerDbLocal(await usagerDao.getUsager(nomUsager))
}

async function getChallengeAjouter(connexion, setChallenge) {
    console.debug("Charger challenge ajouter webauthn")
    const challengeWebauthn = await connexion.declencherAjoutWebauthn()
    console.debug("Challenge : %O", challengeWebauthn)
    setChallenge(challengeWebauthn)
}

async function ajouterMethode(connexion, nomUsager, fingerprintPk, challenge, resetMethodes, opts) {
    opts = opts || {}
    // console.debug("Ajouter webauthn pour usager %s", nomUsager)

    // NB : Pour que l'enregistrement avec iOS fonctionne bien, il faut que la
    //      thread de l'evenement soit la meme que celle qui declenche
    //      navigator.credentials.create({publicKey}) sous repondreRegistrationChallenge
    if(challenge.publicKey) challenge = challenge.publicKey
    const reponse = await repondreRegistrationChallenge(nomUsager, challenge, opts)
    console.debug("Reponse ajout webauthn : %O", reponse)

    const hostname = window.location.hostname

    const params = {
        reponseChallenge: reponse,
        fingerprintPk,
        hostname,
    }

    if(resetMethodes) {
        params.reset_cles = true
    }

    console.debug("reponseChallenge : %O", params)

    const resultatAjout = await connexion.repondreChallengeRegistrationWebauthn(params)
    console.debug("Resultat ajout : %O", resultatAjout)
    if(resultatAjout !== true) {
        const error = new Error("Erreur, ajout methode refusee (back-end)")
        error.reponse = resultatAjout
        throw error
    }
}

export async function preparerAuthentification(nomUsager, challengeWebauthn, requete, opts) {
    opts = opts || {}
    if(!challengeWebauthn) throw new Error("preparerAuthentification challengeWebauthn absent")
    console.debug("Preparer authentification avec : ", challengeWebauthn)

    const publicKey = {...challengeWebauthn.publicKey}

    // Decoder les champs base64url
    publicKey.challenge = base64url.toBuffer(publicKey.challenge)
    publicKey.allowCredentials = (publicKey.allowCredentials || []).map(cred=>{
        const idBytes = base64url.toBuffer(cred.id)
        return {
            ...cred,
            id: idBytes
        }
    })

    let demandeCertificat = null
    if(requete) {
        const csr = requete.csr || requete
        // console.debug("On va hacher le CSR et utiliser le hachage dans le challenge pour faire une demande de certificat")
        // if(props.appendLog) props.appendLog(`On va hacher le CSR et utiliser le hachage dans le challenge pour faire une demande de certificat`)
        demandeCertificat = {
            nomUsager,
            csr,
            date: Math.floor(new Date().getTime()/1000)
        }
        if(opts.activationTierce === true) demandeCertificat.activationTierce = true
        const hachageDemandeCert = await hacherMessage(demandeCertificat, {bytesOnly: true, hashingCode: 'blake2s-256'})
        console.debug("Hachage demande cert %O = %O, ajouter au challenge existant de : %O", hachageDemandeCert, demandeCertificat, publicKey.challenge)
        
        // Concatener le challenge recu (32 bytes) au hachage de la commande
        // Permet de signer la commande de demande de certificat avec webauthn
        const challengeMaj = new Uint8Array(64)
        challengeMaj.set(publicKey.challenge, 0)
        challengeMaj.set(hachageDemandeCert, 32)
        publicKey.challenge = challengeMaj

        //challenge[0] = CONST_COMMANDE_SIGNER_CSR
        //challenge.set(hachageDemandeCert, 1)  // Override bytes 1-65 du challenge
        console.debug("Challenge override pour demander signature certificat : %O", publicKey.challenge)
        // if(props.appendLog) props.appendLog(`Hachage demande cert ${JSON.stringify(hachageDemandeCert)}`)
    } 
    // else if(challenge[0] !== CONST_COMMANDE_AUTH) {
    //     console.error("Challenge[0] : %d !== %d", challenge[0], CONST_COMMANDE_AUTH)
    //     throw new Error("Erreur challenge n'est pas de type authentification (code!==1)")
    // }        

    const resultat = { publicKey, demandeCertificat }
    console.debug("Prep publicKey/demandeCertificat : %O", resultat)
    
    return resultat
}

async function authentifier(connexion, nomUsager, demandeCertificat, publicKey, opts) {
    // N.B. La methode doit etre appelee par la meme thread que l'event pour supporter
    //      TouchID sur iOS.
    console.debug("Signer challenge : %O (opts: %O)", publicKey, opts)
    // if(opts.appendLog) opts.appendLog(`Signer challenge`)

    opts = opts || {}

    if(!nomUsager) throw new Error("authentifier Nom usager manquant")  // Race condition ... pas encore trouve

    const data = await signerDemandeAuthentification(nomUsager, demandeCertificat, publicKey, {connexion})

    console.debug("Data a soumettre pour reponse webauthn : %O", data)
    const resultatAuthentification = await connexion.authentifierWebauthn(data, opts)
    console.debug("Resultat authentification : %O", resultatAuthentification)
    // const contenu = JSON.parse(resultatAuthentification.contenu)

    if(resultatAuthentification.userId) {
        return resultatAuthentification
    } else {
        throw new Error("WebAuthn.authentifier Erreur authentification")
    }
}

export async function signerDemandeAuthentification(nomUsager, demandeCertificat, publicKey, opts) {
    opts = opts || {}
    // const connexion = opts.connexion
    // N.B. La methode doit etre appelee par la meme thread que l'event pour supporter
    //      TouchID sur iOS.
    // console.debug("Signer challenge : %O (challengeWebauthn %O, opts: %O)", publicKey, challengeWebauthn, opts)
    // if(opts.appendLog) opts.appendLog(`Signer challenge`)

    if(!nomUsager) throw new Error("signerDemandeAuthentification Nom usager manquant")  // Race condition ... pas encore trouve

    // S'assurer qu'on a un challenge de type 'authentification'
    // const demandeCertificat = opts.demandeCertificat?opts.demandeCertificat:null
    const data = {nomUsager, demandeCertificat}
    
    const publicKeyCredentialSignee = await navigator.credentials.get({publicKey})
    // console.debug("PublicKeyCredential signee : %O", publicKeyCredentialSignee)
    // if(opts.appendLog) opts.appendLog(`PublicKeyCredential signee : ${JSON.stringify(publicKeyCredentialSignee)}`)

    const reponseSignee = publicKeyCredentialSignee.response

    const reponseSerialisable = {
        // id: publicKeyCredentialSignee.rawId,
        // id64: base64.encode(new Uint8Array(publicKeyCredentialSignee.rawId)),  // String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(publicKeyCredentialSignee.rawId))),
        id64: base64url.encode(new Uint8Array(publicKeyCredentialSignee.rawId)),
        response: {
            // authenticatorData: reponseSignee.authenticatorData?base64.encode(new Uint8Array(reponseSignee.authenticatorData)):null,
            // clientDataJSON: reponseSignee.clientDataJSON?base64.encode(new Uint8Array(reponseSignee.clientDataJSON)):null,
            // signature: reponseSignee.signature?base64.encode(new Uint8Array(reponseSignee.signature)):null,
            // userHandle: reponseSignee.userHandle?base64.encode(new Uint8Array(reponseSignee.userHandle)):null,

            authenticatorData: reponseSignee.authenticatorData?base64url.encode(new Uint8Array(reponseSignee.authenticatorData)):null,
            clientDataJSON: reponseSignee.clientDataJSON?base64url.encode(new Uint8Array(reponseSignee.clientDataJSON)):null,
            signature: reponseSignee.signature?base64url.encode(new Uint8Array(reponseSignee.signature)):null,
            userHandle: reponseSignee.userHandle?base64url.encode(new Uint8Array(reponseSignee.userHandle)):null,
        },
        type: publicKeyCredentialSignee.type,
    }

    console.debug("Reponse serialisable : %O", reponseSerialisable)

    data.webauthn = reponseSerialisable

    return data
}
