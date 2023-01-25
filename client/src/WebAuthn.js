import {useState, useEffect, useCallback} from 'react'
import Button from 'react-bootstrap/Button'
import multibase from 'multibase'
import { base64 } from 'multiformats/bases/base64'

import { CONST_COMMANDE_AUTH, CONST_COMMANDE_SIGNER_CSR } from '@dugrema/millegrilles.utiljs/src/constantes'
import { usagerDao, repondreRegistrationChallenge, BoutonActif } from '@dugrema/millegrilles.reactjs'
import { hacherMessage } from '@dugrema/millegrilles.reactjs/src/formatteurMessage'

import useWorkers from './WorkerContext'

import { sauvegarderCertificatPem, genererCle } from './comptesUtil'

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
        ajouterMethode(connexion, nomUsager, fingerprintPk, challenge, resetMethodes)
            .then(()=>{
                setResultat('succes')
                if(confirmationCb) confirmationCb()
            })
            .catch(err=>{
                setResultat('echec')
                erreurCb(err, 'Erreur ajouter methode')
            })
    }, [connexion, nomUsager, fingerprintPk, challenge, resetMethodes, confirmationCb, erreurCb, setResultat])

    useEffect(
        () => {
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
        authentifier(connexion, nomUsager, challenge, demandeCertificat, publicKey)
            .then(reponse=>{
                console.debug("BoutonAuthentifierWebauthn Reponse authentifier ", reponse)
                onSuccess(reponse)
            })
            .catch(err=>handlerErreur(err, 'BoutonAuthentifierWebauthn.authentifierCb Erreur authentification'))
            .finally(()=>{setAttente(false)})
    }, [connexion, nomUsager, challenge, reponseChallengeAuthentifier, onSuccess, setAttente, setErreur, handlerErreur])

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
        variant, className, usagerDbLocal, setUsagerDbLocal, challenge, 
        setAttente, onSuccess, onError,
    } = props

    const workers = useWorkers()

    const { nomUsager } = usagerDbLocal

    const [nouvelleCleCsr, setNouvelleCleCsr] = useState('')

    const majCertificatCb = useCallback(()=>{
        if(setAttente) setAttente(true)
        const cleCsr = nouvelleCleCsr.cleCsr
        const {demandeCertificat, publicKey} = nouvelleCleCsr.reponseChallengeAuthentifier
        majCertificat(workers, nomUsager, challenge, demandeCertificat, publicKey, cleCsr, setUsagerDbLocal)
            .then(()=>{if(onSuccess) onSuccess('Nouveau certificat recu.')})
            .catch(err=>{if(onError) onError(err); else console.error("Erreur : %O", err)})
            .finally(()=>{if(setAttente) setAttente(false)})
    }, [
        workers, nomUsager, nouvelleCleCsr, setUsagerDbLocal, 
        challenge, setAttente, onSuccess, onError
    ])

    // Preparer csr, cle, preuve a signer
    useEffect(()=>{
        if(!nouvelleCleCsr) {
            preparerNouveauCertificat(workers, nomUsager)
                .then(cle=>{
                    // console.debug("Cle challenge/csr : %O", cle)
                    setNouvelleCleCsr(cle)
                })
                .catch(err=>onError(err))
        }
    }, [workers, nomUsager, nouvelleCleCsr, setNouvelleCleCsr, onError])

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

    const hostname = window.location.hostname
    const infoUsager = await connexion.getInfoUsager(nomUsager, null, null, hostname)
    // console.debug("Etat usager backend : %O", infoUsager)
    const challenge = infoUsager.challengeWebauthn
    if(!challenge) return null

    const reponseChallengeAuthentifier = await preparerAuthentification(nomUsager, challenge, cleCsr)
    
    return {cleCsr, challengeWebAuthn: challenge, reponseChallengeAuthentifier}
}

async function majCertificat(workers, nomUsager, challenge, demandeCertificat, publicKey, cleCsr, setUsagerDbLocal) {
    const {connexion} = workers
    const reponse = await authentifier(connexion, nomUsager, challenge, demandeCertificat, publicKey, {noformat: false})
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
    // console.debug("Ajouter webauthn pour usager %s", nomUsager)

    // NB : Pour que l'enregistrement avec iOS fonctionne bien, il faut que la
    //      thread de l'evenement soit la meme que celle qui declenche
    //      navigator.credentials.create({publicKey}) sous repondreRegistrationChallenge
    const reponse = await repondreRegistrationChallenge(nomUsager, challenge)
    // console.debug("Reponse ajout webauthn : %O", reponse)

    const hostname = window.location.hostname

    const params = {
        reponseChallenge: reponse,
        fingerprintPk,
        hostname,
    }

    if(resetMethodes) {
        params.desactiverAutres = true
    }

    console.debug("reponseChallenge : %O", params)

    const resultatAjout = await connexion.repondreChallengeRegistrationWebauthn(params)
    // console.debug("Resultat ajout : %O", resultatAjout)
    if(resultatAjout !== true) throw new Error("Erreur, ajout methode refusee (back-end)")
}

export async function preparerAuthentification(nomUsager, challengeWebauthn, requete, opts) {
    opts = opts || {}
    if(!challengeWebauthn) throw new Error("preparerAuthentification challengeWebauthn absent")
    const challenge = multibase.decode(challengeWebauthn.challenge)
    var allowCredentials = challengeWebauthn.allowCredentials
    if(allowCredentials) {
        allowCredentials = allowCredentials.map(item=>{
            return {...item, id: multibase.decode(item.id)}
        })
    }

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

async function authentifier(connexion, nomUsager, challengeWebauthn, demandeCertificat, publicKey, opts) {
    // N.B. La methode doit etre appelee par la meme thread que l'event pour supporter
    //      TouchID sur iOS.
    console.debug("Signer challenge : %O (challengeWebauthn %O, opts: %O)", publicKey, challengeWebauthn, opts)
    // if(opts.appendLog) opts.appendLog(`Signer challenge`)

    opts = opts || {}

    if(!nomUsager) throw new Error("authentifier Nom usager manquant")  // Race condition ... pas encore trouve

    const data = await signerDemandeAuthentification(nomUsager, challengeWebauthn, demandeCertificat, publicKey, {connexion})

    console.debug("Data a soumettre pour reponse webauthn : %O", data)
    const resultatAuthentification = await connexion.authentifierWebauthn(data, opts)
    console.debug("Resultat authentification : %O", resultatAuthentification)

    if(resultatAuthentification.userId) {
        return resultatAuthentification
    } else {
        throw new Error("WebAuthn.authentifier Erreur authentification")
    }
}

export async function signerDemandeAuthentification(nomUsager, challengeWebauthn, demandeCertificat, publicKey, opts) {
    opts = opts || {}
    const connexion = opts.connexion
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

    try {
        let challengeSigne = {challenge: challengeWebauthn.challenge}
        console.debug("signerDemandeAuthentification Challenge signe - formatter : ", challengeSigne)
        challengeSigne = await connexion.formatterMessage(challengeSigne, 'signature', {attacherCertificat: true})
        data.signatureCertificat = challengeSigne
    } catch(err) {
        // console.debug("Authentification - certificat non disponible, signature webauthn seulement : %O", err)
        console.debug("Authentification - certificat non disponible, signature webauthn seulement")
    }

    const reponseSignee = publicKeyCredentialSignee.response

    const reponseSerialisable = {
        // id: publicKeyCredentialSignee.rawId,
        id64: base64.encode(new Uint8Array(publicKeyCredentialSignee.rawId)),  // String.fromCharCode.apply(null, multibase.encode('base64', new Uint8Array(publicKeyCredentialSignee.rawId))),
        response: {
            authenticatorData: reponseSignee.authenticatorData?base64.encode(new Uint8Array(reponseSignee.authenticatorData)):null,
            clientDataJSON: reponseSignee.clientDataJSON?base64.encode(new Uint8Array(reponseSignee.clientDataJSON)):null,
            signature: reponseSignee.signature?base64.encode(new Uint8Array(reponseSignee.signature)):null,
            userHandle: reponseSignee.userHandle?base64.encode(new Uint8Array(reponseSignee.userHandle)):null,
        },
        type: publicKeyCredentialSignee.type,
    }

    console.debug("Reponse serialisable : %O", reponseSerialisable)

    data.webauthn = reponseSerialisable

    return data
}
