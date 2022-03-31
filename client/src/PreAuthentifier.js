import {useEffect, useState, useCallback} from 'react'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import { Trans, useTranslation } from 'react-i18next'
import multibase from 'multibase'

import { genererClePrivee, genererCsrNavigateur } from '@dugrema/millegrilles.utiljs/src/certificats'
import { pki as forgePki } from '@dugrema/node-forge'

import * as usagerDao from './components/usagerDao'

function PreAuthentifier(props) {
    
    const { workers, erreurCb } = props

    const [listeUsagers, setListeUsagers] = useState('')
    const [nomUsager, setNomUsager] = useState(window.localStorage.getItem('usager')||'')
    const [informationUsager, setInformationUsager] = useState('')
    const [nouvelUsager, setNouvelUsager] = useState(false)

    useEffect(()=>{
        usagerDao.getListeUsagers()
            .then(usagers=>{
                if(usagers.length === 0) setNouvelUsager(true)
                setListeUsagers(usagers)
            })
            .catch(err=>erreurCb(err))
    }, [setListeUsagers, setNouvelUsager, erreurCb])


    let Etape = FormSelectionnerUsager
    if(informationUsager) {
        if(informationUsager.compteUsager === false) Etape = InscrireUsager
        else Etape = Authentifier
    }

    return (
        <Row>
            <Col sm={1} md={2}></Col>
            <Col>
                <p>Acces prive pour les usagers de la millegrille</p>
                <Etape 
                    workers={workers}
                    nouvelUsager={nouvelUsager}
                    setNouvelUsager={setNouvelUsager}
                    nomUsager={nomUsager} 
                    setNomUsager={setNomUsager} 
                    listeUsagers={listeUsagers}
                    informationUsager={informationUsager}
                    setInformationUsager={setInformationUsager}
                    erreurCb={erreurCb}
                    />
            </Col>
            <Col sm={1} md={2}></Col>
        </Row>
    )
}

export default PreAuthentifier

function FormSelectionnerUsager(props) {

    const {nouvelUsager} = props

    return (
        <Form.Group controlId="formNomUsager">
            <Form.Label><Trans>authentification.nomUsager</Trans></Form.Label>
            <InputSaisirNomUsager 
                disabled={!nouvelUsager} 
                {...props} />
            <InputAfficherListeUsagers 
                disabled={nouvelUsager} 
                {...props} />
            <BoutonsAuthentifier {...props} />
        </Form.Group>
    )
}

function InputSaisirNomUsager(props) {
    const {nomUsager, setNomUsager} = props

    const {t} = useTranslation()
   
    const changerNomUsager = useCallback(event=>setNomUsager(event.currentTarget.value), [setNomUsager])
    const onClickSuivantCb = useCallback(event=>{
        console.debug("Suivant sur usager %s", nomUsager)
    }, [nomUsager])

    if(props.disabled) return ''

    return (
      <>
        <Form.Control
          type="text"
          placeholder={t('authentification.saisirNom')}
          value={props.nomUsager}
          onChange={changerNomUsager}
          disabled={props.attente || props.informationUsager} />
  
        <Form.Text className="text-muted">
          <Trans>authentification.instructions1</Trans>
        </Form.Text>
      </>
    )
}

function InputAfficherListeUsagers(props) {
    const {t} = useTranslation()
  
    if(props.disabled || !props.listeUsagers) return ''
  
    const optionsUsagers = props.listeUsagers.map(nomUsager=>{
      return (
        <option value={nomUsager}>{nomUsager}</option>
      )
    })
  
    return (
        <>
            <Form.Select
                type="text"
                defaultValue={props.nomUsager}
                placeholder={t('authentification.saisirNom')}
                onChange={props.selectionnerUsager}
                disabled={props.attente || props.informationUsager}>
        
                {props.listeUsagers.map(nomUsager=>(
                    <option key={nomUsager} value={nomUsager}>{nomUsager}</option>
                ))}
    
            </Form.Select>
    
            <Form.Text className="text-muted">
                <Trans>authentification.instructions2</Trans>
            </Form.Text>
        </>
    )
}

function BoutonsAuthentifier(props) {

    const {workers, nomUsager, nouvelUsager, setNouvelUsager, setInformationUsager, erreurCb} = props
    const suivantDisabled = nomUsager?false:true

    const setNouvelUsagerCb = useCallback( () => setNouvelUsager(true), [setNouvelUsager])
    const annulerCb = useCallback( () => setNouvelUsager(false), [setNouvelUsager])
    const suivantCb = useCallback(
        () => suivantChoisirUsager(workers, nomUsager, setInformationUsager, erreurCb)
            .catch(err=>erreurCb(err)), 
        [workers, nomUsager, setInformationUsager, erreurCb]
    )

    return (
        <Row>
            <Col className="button-list">

                <Button disabled={suivantDisabled} onClick={suivantCb}>Suivant <i className="fa fa-arrow-right"/></Button>

                <Button variant="secondary" disabled={nouvelUsager} onClick={setNouvelUsagerCb}>
                    Nouveau
                </Button>

                <Button variant="secondary">
                    Options
                </Button>

                <Button variant="secondary" disabled={!nouvelUsager} onClick={annulerCb}>
                    <Trans>bouton.annuler</Trans>
                </Button>

            </Col>
        </Row>
    )
}

function InscrireUsager(props) {

    const {workers, setInformationUsager, nomUsager, erreurCb} = props

    const confirmerAuthentification = () => {throw new Error('todo')}

    const onClickSuivant = useCallback( () => {
        suivantInscrire(workers, nomUsager, confirmerAuthentification, erreurCb)
            .catch(err=>erreurCb(err))
    }, [workers, nomUsager, confirmerAuthentification, erreurCb])
    const onClickAnnuler = useCallback( () => setInformationUsager(''), [setInformationUsager])

    return (
        <>
            <h2>Créer un nouveau compte</h2>

            <div className="boite-coinsronds boite-authentification">
                <p>Le compte <strong>{props.nomUsager}</strong> est disponible.</p>

                <p>
                    Pour le créer, veuillez cliquer sur le bouton Inscrire et
                    suivre les instructions.
                </p>

                <Row>
                    <Col className="button-list">
                        <Button onClick={onClickSuivant}>Inscrire <i className="fa fa-arrow-right"/></Button>
                        <Button variant="secondary" onClick={onClickAnnuler}>
                            <Trans>bouton.annuler</Trans>
                        </Button>
                    </Col>
                </Row>
            </div>
        </>
    )
}

function Authentifier(props) {
    return 'Authentifier TODO'
}

async function suivantInscrire(workers, nomUsager, confirmerAuthentification, erreurCb) {
    console.debug("Inscrire")
    try {
        const {connexion} = workers
        const {csr} = await initialiserCompteUsager(nomUsager)
 
        console.debug("Inscrire usager %s avec CSR navigateur\n%O", nomUsager, csr)
        const reponseInscription = await connexion.inscrireUsager(nomUsager, csr)
        console.debug("Reponse inscription : %O", reponseInscription)
      
        // Enregistrer le certificat dans IndexedDB
        const certificatChaine = reponseInscription.certificat
        console.debug("Certificats recus : cert: %O", certificatChaine)
        await sauvegarderCertificatPem(nomUsager, certificatChaine)
      
        // await confirmerAuthentification({...reponse, nomUsager})
    } catch(err) {
        console.error("Erreur inscrire usager : %O", err)
        erreurCb(err, "Erreur inscrire usager")
    }
}

async function suivantChoisirUsager(workers, nomUsager, setInformationUsager, erreurCb) {
    const connexion = workers.connexion
    console.debug("Suivant avec usager %s", nomUsager)
    let usagerLocal = await usagerDao.getUsager(nomUsager)
    console.debug("Usager local : %O", usagerLocal)
    let fingerprintPk = null
    if(usagerLocal) {
        fingerprintPk = usagerLocal.fingerprintPk
    }
    const compteUsager = await chargerUsager(connexion, nomUsager, fingerprintPk)
    console.debug('CompteUsager : %O', compteUsager)
    const infoUsager = compteUsager.infoUsager
    setInformationUsager(infoUsager)
}

async function chargerUsager(connexion, nomUsager, fingerprintPk) {
    const infoUsager = await connexion.getInfoUsager(nomUsager, fingerprintPk)
    console.debug("Information usager recue : %O", infoUsager)
  
    // Verifier si on peut faire un auto-login (seule methode === certificat)
    const methodesDisponibles = infoUsager.methodesDisponibles || {},
          challengeCertificat = infoUsager.challengeCertificat
    let authentifie = false
  
    // const formatteurReady = await connexion.isFormatteurReady()
    // console.debug("Formatteur ready? %s", formatteurReady)
  
    // if(formatteurReady && methodesDisponibles.length === 1 && methodesDisponibles[0] === 'certificat' && challengeCertificat) {
    //     console.debug("Auto-login via certificat local, challenge: %O", challengeCertificat)
    //     try {
    //         const reponse = await connexion.authentifierCertificat(challengeCertificat)
    //         console.debug("Reponse authentifier certificat local: %O", reponse)
    //         if(reponse.authentifie === true) {
    //         // Usager authentifie avec succes
    //         authentifie = true
    //         // setInfoUsager({...reponse, ...infoUsager})  // Similaire a l'information getInfoIdmg de connecter
    //         return {infoUsager, confirmation: reponse, authentifie}
    //         }
    //     } catch(err) {
    //         // Ok, le compte est probablement protege par une authentification forte
    //         console.warn("Erreur auto-login : %O, %O", err, err.code)
    //     }
    // }
  
    return {infoUsager, authentifie}
}

// Initialiser le compte de l'usager
async function initialiserCompteUsager(nomUsager, opts) {
    if(!opts) opts = {}
  
    if( ! nomUsager ) throw new Error("Usager null")
  
    let usager = await usagerDao.getUsager(nomUsager)
    const certificat = usager?usager.certificat:null
    let genererCsr = false
  
    console.debug("initialiserNavigateur Information usager initiale : %O", usager)
  
    if( !usager ) {
        console.debug("Nouvel usager, initialiser compte et creer CSR %s", nomUsager)
        genererCsr = true
    } else if( opts.regenerer === true ) {
        console.debug("Force generer un nouveau certificat")
        genererCsr = true
    } else if(!certificat && !usager.csr) {
        console.debug("Certificat/CSR absent, generer nouveau certificat")
        genererCsr = true
    } else if(certificat) {
        // Verifier la validite du certificat
        const {certificatValide, canRenew} = verifierDateRenouvellementCertificat(certificat) 

        if( canRenew || !certificatValide ) {
            // Generer nouveau certificat
            console.debug("Certificat invalide ou date de renouvellement atteinte")
            genererCsr = true
        }
    }
  
    if(genererCsr) {
        const nouvellesCles = await genererCle(nomUsager)
        await usagerDao.updateUsager(nomUsager, nouvellesCles)
        usager = {...usager, ...nouvellesCles}
    }
  
    console.debug("Compte usager : %O", usager)
    return usager
}

function verifierDateRenouvellementCertificat(certificat) {
    // Verifier la validite du certificat
    const certForge = forgePki.certificateFromPem(certificat.join(''))
    
    const validityNotAfter = certForge.validity.notAfter.getTime(),
            validityNotBefore = certForge.validity.notBefore.getTime()
    const certificatValide = new Date().getTime() < validityNotAfter

    // Calculer 2/3 de la duree pour trigger de renouvellement
    const validityRenew = (validityNotAfter - validityNotBefore) / 3.0 * 2.0 + validityNotBefore
    const canRenew = new Date().getTime() > validityRenew

    console.debug(
        "Certificat valide presentement : %s, epoch can renew? (%s) : %s (%s)",
        certificatValide, canRenew, validityRenew, new Date(validityRenew)
    )

    return {certificatValide, canRenew}
}

async function genererCle(nomUsager) {
    console.debug("Generer nouveau CSR")

    // Generer nouveau keypair et stocker
    const cles = await genererClePrivee()

    // Extraire cles, generer CSR du navigateur
    const clePubliqueBytes = String.fromCharCode.apply(null, multibase.encode('base64', cles.publicKey.publicKeyBytes))
    // const clePriveeBytes = String.fromCharCode.apply(null, multibase.encode('base64', cles.privateKey.privateKeyBytes))
    const csrNavigateur = await genererCsrNavigateur(nomUsager, cles.pem)
    console.debug("Nouveau cert public key bytes : %s\nCSR Navigateur :\n%s", clePubliqueBytes, csrNavigateur)

    return {
        certificatValide: false,
        fingerprint_pk: clePubliqueBytes, 
        csr: csrNavigateur,

        clePriveePem: cles.pem,

        certificat: null,  // Reset certificat s'il est present

        // fingerprintPk,
        // dechiffrer: keypair.clePriveeDecrypt,
        // signer: keypair.clePriveeSigner,
        // publique: keypair.clePublique,
    }
}

export async function sauvegarderCertificatPem(usager, chainePem) {
    const certForge = forgePki.certificateFromPem(chainePem[0])  // Validation simple, format correct
    const nomUsager = certForge.subject.getField('CN').value
    const validityNotAfter = certForge.validity.notAfter.getTime()
    console.debug("Sauvegarde du nouveau cerfificat de navigateur usager %s, expiration %O", nomUsager, validityNotAfter)
  
    if(nomUsager !== usager) throw new Error(`Certificat pour le mauvais usager : ${nomUsager} !== ${usager}`)
  
    const copieChainePem = [...chainePem]
    const ca = copieChainePem.pop()
  
    await usagerDao.updateUsager(usager, {ca, certificat: copieChainePem, csr: null})
}
