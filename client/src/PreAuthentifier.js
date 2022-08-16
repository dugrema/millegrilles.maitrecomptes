import {useEffect, useState, useCallback, useMemo} from 'react'
import {proxy as comlinkProxy} from 'comlink'

import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Alert from 'react-bootstrap/Alert'
import { Trans, useTranslation } from 'react-i18next'

import { usagerDao } from '@dugrema/millegrilles.reactjs'

import { BoutonAuthentifierWebauthn } from './WebAuthn'
import { RenderCsr } from './QrCodes'

import { sauvegarderCertificatPem, initialiserCompteUsager } from './comptesUtil'

function PreAuthentifier(props) {
    
    const { 
        workers, erreurCb, usagerDbLocal, setUsagerDbLocal, setResultatAuthentificationUsager,
        formatteurPret, etatConnexion, usagerSessionActive, setUsagerSessionActive, 
    } = props

    const [listeUsagers, setListeUsagers] = useState('')
    const [nomUsager, setNomUsager] = useState(window.localStorage.getItem('usager')||'')
    const [nouvelUsager, setNouvelUsager] = useState(false)  // Flag pour bouton nouvel usager
    const [authentifier, setAuthentifier] = useState(false)  // Flag pour ecran inscrire/authentifier
    const [etatUsagerBackend, setEtatUsagerBackend] = useState('')  // Info compte backend
    const [attente, setAttente] = useState(false)
    const [compteRecovery, setCompteRecovery] = useState(false)  // Mode pour utiliser un code pour associer compte

    useEffect(()=>{
        usagerDao.getListeUsagers()
            .then(usagers=>{
                if(usagers.length === 0) setNouvelUsager(true)
                usagers.sort()  // Trier liste par nom
                setListeUsagers(usagers)
            })
            .catch(err=>erreurCb(err))
    }, [setListeUsagers, setNouvelUsager, erreurCb])

    // Detecter le chargement d'un certificat via fingerprintPk
    // Le certificat peut arriver via requete ou evenement
    useEffect(()=>{
        if(!usagerDbLocal) return

        const { connexion } = workers
        const nomUsager = usagerDbLocal.nomUsager
        const requete = usagerDbLocal.requete
        if(requete && etatUsagerBackend.infoUsager && etatUsagerBackend.infoUsager.certificat) {
            const infoUsager = etatUsagerBackend.infoUsager || {},
                  certificat = infoUsager.certificat

            if(certificat) {
                //console.debug("Nouveau certificat recu (via fingerprintPk) : %O\nRequete %O", certificat, requete)
                const { clePriveePem, fingerprintPk } = requete
                sauvegarderCertificatPem(nomUsager, certificat, {requete: null, fingerprintPk, clePriveePem})
                    .then(async () => {
                        const usagerMaj = await usagerDao.getUsager(nomUsager)
                        // Charger info back-end, devrait avoir l'autorisation d'activation
                        const nouvelleInfoBackend = await chargerUsager(connexion, nomUsager, null, fingerprintPk)

                        //console.debug("Nouvelle information, local %O, back-end %O", usagerMaj, nouvelleInfoBackend)

                        // Revenir a l'ecran d'authentification
                        setAuthentifier(false)
                        setCompteRecovery(false)

                        // Pour eviter cycle, on fait sortir de l'ecran en premier. Set Usager ensuite.
                        setEtatUsagerBackend(nouvelleInfoBackend)
                        setUsagerDbLocal(usagerMaj)
                    })
                    .catch(err=>{
                        erreurCb(err)
                    })
            }
        }
    }, [workers, usagerDbLocal, etatUsagerBackend, erreurCb, setUsagerDbLocal])

    let Etape = FormSelectionnerUsager
    if(compteRecovery) Etape = CompteRecovery
    else if(authentifier && etatUsagerBackend && etatUsagerBackend.infoUsager) {
        if(etatUsagerBackend.infoUsager.compteUsager === false) Etape = InscrireUsager
        else Etape = Authentifier
    }

    return (
        <Row>
            <Col sm={1} md={2}></Col>
            <Col>
                <p></p>
                <Etape 
                    workers={workers}
                    etatConnexion={etatConnexion}
                    nouvelUsager={nouvelUsager}
                    setNouvelUsager={setNouvelUsager}
                    setAuthentifier={setAuthentifier}
                    attente={attente}
                    setAttente={setAttente}
                    nomUsager={nomUsager} 
                    setNomUsager={setNomUsager} 
                    listeUsagers={listeUsagers}
                    etatUsagerBackend={etatUsagerBackend}
                    setEtatUsagerBackend={setEtatUsagerBackend}
                    usagerDbLocal={usagerDbLocal}
                    setUsagerDbLocal={setUsagerDbLocal}
                    formatteurPret={formatteurPret}
                    setResultatAuthentificationUsager={setResultatAuthentificationUsager}
                    usagerSessionActive={usagerSessionActive}
                    setUsagerSessionActive={setUsagerSessionActive}
                    compteRecovery={compteRecovery}
                    setCompteRecovery={setCompteRecovery}
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
            <Form.Label><Trans>Authentification.nomUsager</Trans></Form.Label>
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
    const {setNomUsager} = props

    const {t} = useTranslation()
   
    const changerNomUsager = useCallback(event=>setNomUsager(event.currentTarget.value), [setNomUsager])

    if(props.disabled) return ''

    return (
      <>
        <Form.Control
          type="text"
          placeholder={t('Authentification.saisirNom')}
          value={props.nomUsager}
          onChange={changerNomUsager}
          disabled={props.attente} />
  
        <Form.Text className="text-muted">
          <Trans>Authentification.instructions1</Trans>
        </Form.Text>
      </>
    )
}

function InputAfficherListeUsagers(props) {

    const {
        workers, etatConnexion, disabled, nomUsager, 
        listeUsagers, setNomUsager, setEtatUsagerBackend, setUsagerDbLocal, 
        setResultatAuthentificationUsager, setNouvelUsager, 
        erreurCb
    } = props

    const {t} = useTranslation()

    const onChangeUsager = useCallback(event=>{
        setEtatUsagerBackend('')
        setUsagerDbLocal('')
        setResultatAuthentificationUsager('')
        setNouvelUsager(false)

        setNomUsager(event.currentTarget.value)
    }, [setNomUsager, setEtatUsagerBackend, setUsagerDbLocal, setResultatAuthentificationUsager, setNouvelUsager])

    useEffect(()=>{
        if(!disabled && listeUsagers.length > 0) {
            if(listeUsagers.includes(nomUsager)) {
                // Rien a faire
            } else {
                const usagerLocal = window.localStorage.getItem('usager')
                if(listeUsagers.includes(usagerLocal)) {
                    setNomUsager(usagerLocal)
                } else {
                    setNomUsager(listeUsagers[0])
                }
            }
        }
    }, [disabled, nomUsager, setNomUsager, listeUsagers])

    useEffect(()=>{
        if(etatConnexion && !disabled && nomUsager) {
            // console.debug("Pre-charger le compte usager %s", nomUsager)
            preparerUsager(workers, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, erreurCb)
        }
    }, [disabled, etatConnexion, workers, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, erreurCb])

    if(disabled || !listeUsagers) return ''
  
    return (
        <>
            <Form.Select
                type="text"
                value={nomUsager}
                placeholder={t('Authentification.saisirNom')}
                onChange={onChangeUsager}
                disabled={props.attente}>
        
                {props.listeUsagers.map(nomUsager=>(
                    <option key={nomUsager} value={nomUsager}>{nomUsager}</option>
                ))}
    
            </Form.Select>
    
            <Form.Text className="text-muted">
                <Trans>Authentification.instructions2</Trans>
            </Form.Text>
        </>
    )
}

function CompteRecovery(props) {

    const { 
        workers, etatUsagerBackend,
        setUsagerDbLocal, setEtatUsagerBackend, 
        setResultatAuthentificationUsager, setAuthentifier, setCompteRecovery,
        erreurCb,
    } = props
    const usagerDbLocal = useMemo(()=>{return props.usagerDbLocal || {}}, [props.usagerDbLocal])
    const requete = usagerDbLocal.requete || {},
          csr = requete.csr,
          fingerprintPk = requete.fingerprintPk,
          nomUsager = usagerDbLocal.nomUsager

    const [code, setCode] = useState('')
    const [attente, setAttente] = useState(false)

    const onClickWebAuth = useCallback(resultat=>{
        setCompteRecovery(false)  // succes login
        setResultatAuthentificationUsager(resultat)
    }, [setCompteRecovery, setResultatAuthentificationUsager])

    const erreurAuthCb = useCallback((err, message)=>{
        if(err && ![0, 11, 20].includes(err.code)) {
            erreurCb(err, message)
        } else {
            erreurCb("Erreur authentification annulee ou mauvaise cle")
        }
    }, [erreurCb])

    const retourCb = useCallback(()=>{
        setAuthentifier(false)
        setCompteRecovery(false)
    }, [setAuthentifier, setCompteRecovery])

    const evenementFingerprintPkCb = useCallback(evenement=>{
        const { connexion } = workers
        //console.debug("Recu message evenementFingerprintPkCb : %O", evenement)
        const { message } = evenement || {},
              { certificat } = message
        const requete = usagerDbLocal.requete
        if(certificat && requete) {
            const { clePriveePem, fingerprintPk } = requete
            sauvegarderCertificatPem(nomUsager, certificat, {clePriveePem, fingerprintPk})
                .then(async ()=>{
                    const usagerMaj = await usagerDao.getUsager(nomUsager)
                    const nouvelleInfoBackend = await chargerUsager(connexion, nomUsager, null, fingerprintPk)

                    // Revenir a l'ecran d'authentification
                    setAuthentifier(false)
                    setCompteRecovery(false)

                    // Pour eviter cycle, on fait sortir de l'ecran en premier. Set Usager ensuite.
                    setEtatUsagerBackend(nouvelleInfoBackend)
                    setUsagerDbLocal(usagerMaj)
                })
                .catch(err=>erreurCb(err, "Erreur de sauvegarde du nouveau certificat, veuillez cliquer sur Retour et essayer a nouveau."))
        } else {
            console.warn("Recu message evenementFingerprintPkCb sans certificat %O ou requete locale vide %O", evenement, requete)
            erreurCb("Erreur de sauvegarde du nouveau certificat, veuillez cliquer sur Retour et essayer a nouveau.")
        }
    }, [
        workers, nomUsager, usagerDbLocal, 
        setAuthentifier, setCompteRecovery, setEtatUsagerBackend, setUsagerDbLocal, 
        erreurCb,
    ])

    useEffect(()=>{
        const { nomUsager, requete } = usagerDbLocal
        if(nomUsager) {
            if(!requete) {
                //console.debug("Generer nouveau CSR")
                initialiserCompteUsager(nomUsager, {regenerer: true})
                    .then(usager=>{
                        setUsagerDbLocal(usager)
                        return ajouterCsrRecovery(workers, usager)
                    })
                    .catch(err=>erreurCb(err))
            } else {
                ajouterCsrRecovery(workers, usagerDbLocal)
                    .catch(err=>erreurCb(err))
            }
        }
    }, [workers, nomUsager, usagerDbLocal, setUsagerDbLocal, erreurCb])

    useEffect(()=>{
        if(fingerprintPk) {
            let codeComplet = fingerprintPk.slice(fingerprintPk.length-8)
            codeComplet = codeComplet.toLowerCase()
            codeComplet = [codeComplet.slice(0,4), codeComplet.slice(4,8)].join('-')
            setCode(codeComplet)
        } else {
            setCode('')
        }
    }, [fingerprintPk, setCode])

    useEffect(()=>{
        const { connexion } = workers
        if(fingerprintPk) {
            const cb = comlinkProxy(evenementFingerprintPkCb)
            //console.debug("Ajouter listening fingerprints : %s", fingerprintPk)
            connexion.enregistrerCallbackEvenementsActivationFingerprint(fingerprintPk, cb)
                .catch(err=>erreurCb(err))
            return () => {
                //console.debug("Retrait listening fingerprints : %s", fingerprintPk)
                connexion.retirerCallbackEvenementsActivationFingerprint(fingerprintPk, cb)
                    .catch(err=>console.warn("Erreur retrait evenement fingerprints : %O", err))
            }
        }
    }, [workers, fingerprintPk, evenementFingerprintPkCb, erreurCb])

    return (
        <>
            <Alert variant="dark">
                <Alert.Heading>Echec de l'authentification</Alert.Heading>
                <p>
                    L'ouverture d'acces au compte a echouee. 
                    Voici des methodes alternatives pour acceder a votre compte.
                </p>
            </Alert>

            <p>
                Note : cette page ne contient aucune information secrete. Elle peut etre imprimee ou
                relayee a un intermediaire en toute securite.
            </p>

            <Button onClick={retourCb}>Retour</Button>

            <h2>Cle de securite</h2>
            
            <p>Reessayez avec une cle USB/NFC de securite differente.</p>
            <Row>
                <Col>
                    <BoutonAuthentifierWebauthn
                        variant="secondary"
                        workers={workers}
                        challenge={etatUsagerBackend.infoUsager.challengeWebauthn}
                        setAttente={setAttente}
                        setResultatAuthentificationUsager={onClickWebAuth}
                        erreurCb={erreurAuthCb}
                        usagerDbLocal={usagerDbLocal}
                    >
                        Utiliser cle
                    </BoutonAuthentifierWebauthn>

                </Col>
            </Row>

            <br/>

            <h2>Code d'activation</h2>
            <p>
                Utilisez un appareil different deja connecte a votre compte. 
                Vous pouvez aussi demander au proprietaire de la millegrille d'activer ce code.
            </p>
            <p>
                Le code d'activation n'est pas secret. Il peut etre transmis par courriel, 
                message texte ou tout autre intermediaire sans compromettre la securite 
                de votre compte.
            </p>
            <Row><Col md={2}>Compte</Col><Col>{nomUsager}</Col></Row>
            <Row><Col md={2}>Code</Col><Col>{code}</Col></Row>

            <br/>

            <h2>Code QR</h2>
            <p>Autorisez via code QR avec un appareil mobile deja en ligne sur votre compte.</p>
            <RenderCsr value={csr} size={200} />

        </>
    )
}

function BoutonsAuthentifier(props) {

    const {
        workers, nomUsager, setNomUsager, nouvelUsager, setNouvelUsager, etatUsagerBackend, setEtatUsagerBackend, 
        usagerDbLocal, setUsagerDbLocal, usagerSessionActive, setAuthentifier, attente, setAttente, erreurCb, 
        setResultatAuthentificationUsager, setCompteRecovery,
    } = props
    
    const suivantDisabled = nomUsager?false:true

    const setNouvelUsagerCb = useCallback( () => {
        Promise.all([
            setNomUsager(''),
            setEtatUsagerBackend(''),
            setUsagerDbLocal(''),
            setResultatAuthentificationUsager(''),
        ]).then(()=>setNouvelUsager(true))
    }, [setNomUsager, setNouvelUsager, setEtatUsagerBackend, setUsagerDbLocal, setResultatAuthentificationUsager])
    const annulerCb = useCallback( () => setNouvelUsager(false), [setNouvelUsager])
    const suivantCb = useCallback(
        () => {
            if(nouvelUsager === true) {
                setAttente(true)
                preparerUsager(workers, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, erreurCb)
                    .then(()=>setAuthentifier(true))
                    .catch(err=>erreurCb(err))
                    .finally(()=>setAttente(false))
            } else {
                // Information deja chargee, on authentifie
                setAuthentifier(true)
            }
        }, 
        [workers, nouvelUsager, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, setAuthentifier, setAttente, erreurCb]
    )
    const onClickWebAuth = useCallback(resultat=>{
        setAuthentifier(true)
        setResultatAuthentificationUsager(resultat)
    }, [setAuthentifier, setResultatAuthentificationUsager])

    const erreurAuthCb = useCallback((err, message)=>{
        if(err && ![0, 11, 20].includes(err.code)) {
            erreurCb(err, message)
        } else {
            //console.debug("Erreur authentification annulee/mauvaise cle, on passe au mode recovery")
            setCompteRecovery(true)
            setAuthentifier(true)
        }
    }, [erreurCb, setCompteRecovery, setAuthentifier])

    useEffect(()=>{
        if(usagerSessionActive) {
            // console.debug("Session active pour usager %s, on simule click sur Suivant")
            suivantCb()
        }
    }, [suivantCb, usagerSessionActive])

        // Verifier si on a au moins 1 credential enregistre avec webauthn
    const etatUsagerInfo = etatUsagerBackend.infoUsager || {},
          activation = etatUsagerInfo.activation || {},
          peutActiver = activation.associe === false,
          challengeWebauthn = etatUsagerInfo.challengeWebauthn || {},
          allowCredentials = challengeWebauthn.allowCredentials || {}

    let loginSansVerification = etatUsagerBackend && peutActiver

    let variantBouton = loginSansVerification?'success':'primary'

    let boutonSuivant = (
        <Button variant={variantBouton} disabled={attente || suivantDisabled} onClick={suivantCb}>
            <Trans>Forms.next</Trans>
        </Button>
    )

    if(allowCredentials.length > 0 && !peutActiver) {
        boutonSuivant = (
            <BoutonAuthentifierWebauthn
                workers={workers}
                challenge={etatUsagerBackend.infoUsager.challengeWebauthn}
                setAttente={setAttente}
                setResultatAuthentificationUsager={onClickWebAuth}
                erreurCb={erreurAuthCb}
                usagerDbLocal={usagerDbLocal}
            >
                <Trans>Forms.next</Trans>
            </BoutonAuthentifierWebauthn>
        )
    }

    return (
        <>
            <Row>
                <Col className="liste-boutons preauth">

                    {boutonSuivant}

                    <Button variant="secondary" disabled={nouvelUsager} onClick={setNouvelUsagerCb}>
                        <Trans>Forms.new</Trans>
                    </Button>

                    <Button variant="secondary" disabled={!nouvelUsager} onClick={annulerCb}>
                        <Trans>Forms.cancel</Trans>
                    </Button>

                </Col>
            </Row>

            <br/>

            <Alert variant="success" show={loginSansVerification?true:false}>
                <Alert.Heading>Compte debloque</Alert.Heading>
                <p>
                    Ce navigateur a ete pre-autorise pour acceder au compte selectionne. Veuillez acceder au
                    compte en cliquant sur Suivant et ajoutez une methode de verification forte des que possible.
                </p>
            </Alert>

        </>
    )
}

function InscrireUsager(props) {

    const {workers, setAuthentifier, nomUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb} = props

    const onClickSuivant = useCallback( () => {
        suivantInscrire(workers, nomUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb)
            .catch(err=>erreurCb(err))
    }, [workers, nomUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb])
    const onClickAnnuler = useCallback( () => setAuthentifier(false), [setAuthentifier])

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

    const {
        workers, nouvelUsager, setAttente, 
        nomUsager, formatteurPret, usagerDbLocal, 
        setAuthentifier, etatUsagerBackend, setEtatUsagerBackend, 
        setResultatAuthentificationUsager, setUsagerSessionActive, 
        setCompteRecovery,
        erreurCb
    } = props

    const onClickWebAuth = useCallback(resultat=>{
        //console.debug("onclick webauthn : %O", resultat)
        const authentification = {
            ...resultat, 
            authentifie: true, 
            nomUsager,
        }
        setResultatAuthentificationUsager(authentification)
    }, [nomUsager, setResultatAuthentificationUsager])

    // Attendre que le formatteur (certificat) soit pret
    useEffect(()=>{
        //console.debug("Formatteur pret? %s, etat usager back-end : %O", formatteurPret, etatUsagerBackend)
        if(!usagerDbLocal) return 

        const { connexion } = workers
        if(formatteurPret===true && etatUsagerBackend) {
            // Authentifier
            const { methodesDisponibles } = etatUsagerBackend.infoUsager
            if(methodesDisponibles.includes('certificat')) {
                //console.debug("Authentifier avec le certificat")
                // connexion.authentifierCertificat(challengeCertificat)
                connexion.authentifier()
                    .then(reponse=>{
                        //console.debug("Reponse authentifier certificat : %O", reponse)
                        setResultatAuthentificationUsager(reponse)
                    })
                    .catch(err=>{
                        console.error("Authentifier: Erreur de connexion : %O", err)
                        erreurCb(err, 'Erreur de connexion (authentification du certificat refusee)')
                    })
            }
        } else if(!nouvelUsager && formatteurPret === false && !usagerDbLocal.certificat) {
            // On a un certificat absent ou expire
            // console.info("Certificat absent")
            setCompteRecovery(true)
        }
    }, [
        workers, formatteurPret, nouvelUsager, usagerDbLocal, etatUsagerBackend, 
        setResultatAuthentificationUsager, setCompteRecovery, 
        erreurCb
    ])

    // Conserver usager selectionne (pour reload ecran)
    useEffect(()=>window.localStorage.setItem('usager', nomUsager), [nomUsager])

    const recoveryCb = useCallback(()=>setCompteRecovery(true), [setCompteRecovery])

    const annulerCb = useCallback(()=>{
        fermerSession(setAuthentifier, setEtatUsagerBackend, setUsagerSessionActive)
            .catch(err=>erreurCb(err))
    }, [setAuthentifier, setEtatUsagerBackend, setUsagerSessionActive, erreurCb])

    let message = <p>Ouverture d'une nouvelle session en cours ... <i className="fa fa-spinner fa-spin fa-fw" /></p>
    if(nouvelUsager) message = 'Cliquez sur Suivant pour vous connecter.'
    else if(!formatteurPret) message = 'Attente de preparation du certificat'

    return (
        <>
            <Alert variant="info">
                <Alert.Heading>Ouverture de session</Alert.Heading>
                
                {message}
            </Alert>

            <Row>
                <Col className="button-list">
                    {nouvelUsager?
                        <BoutonAuthentifierWebauthn 
                            workers={workers}
                            challenge={etatUsagerBackend.infoUsager.challengeWebauthn}
                            setAttente={setAttente}
                            setResultatAuthentificationUsager={onClickWebAuth}
                            erreurCb={erreurCb}
                            usagerDbLocal={usagerDbLocal}>
                            Suivant
                        </BoutonAuthentifierWebauthn>
                    :''}
                    <Button variant="secondary" onClick={recoveryCb}>Utiliser un code</Button>
                    <Button variant="secondary" onClick={annulerCb}>Annuler</Button>
                </Col>
            </Row>
        </>
    )
}

async function ajouterCsrRecovery(workers, usagerDbLocal) {
    const { connexion } = workers
    const { nomUsager, requete } = usagerDbLocal
    if(nomUsager && requete && requete.csr) {
        const csr = requete.csr
        //console.debug("ajouterCsrRecovery csr: %O", csr)
        const reponse = await connexion.ajouterCsrRecovery(nomUsager, csr)
        //console.debug("ajouterCsrRecovery Reponse %O", reponse)
    }
}

async function suivantInscrire(workers, nomUsager, setUsagerDbLocal, setResultatAuthentificationUsager, erreurCb) {
    //console.debug("Inscrire")
    try {
        const {connexion} = workers
        const usagerInit = await initialiserCompteUsager(nomUsager)
        const requete = usagerInit.requete || {}
        const { csr, clePriveePem, fingerprintPk } = requete
 
        //console.debug("Inscrire usager %s avec CSR navigateur\n%O", nomUsager, csr)
        const reponseInscription = await connexion.inscrireUsager(nomUsager, csr)
        //console.debug("Reponse inscription : %O", reponseInscription)
      
        // Enregistrer le certificat dans IndexedDB
        const certificatChaine = reponseInscription.certificat

        if(!certificatChaine) {
            erreurCb("Le certificat n'a pas ete recu lors de la confirmation d'inscription.", "L'inscription a echouee")
            return
        }

        // Injecter delegations_version: 1 au besoin
        reponseInscription.delegations_version = reponseInscription.delegations_version || 1

        //console.debug("Certificats recus : cert: %O", certificatChaine)
        await sauvegarderCertificatPem(nomUsager, certificatChaine, {clePriveePem, fingerprintPk})
      
        // Recharger usager, applique le nouveau certificat
        const usagerDbLocal = await usagerDao.getUsager(nomUsager)
        await setUsagerDbLocal(usagerDbLocal)

        // Conserver usager selectionne pour reload
        window.localStorage.setItem('usager', nomUsager)

        // Conserver information session
        await setResultatAuthentificationUsager({
            ...reponseInscription, 
            nomUsager,
        })

        if(reponseInscription.authentifie === true) {
            // Declencher une authentification avec le nouveau certificat 
            await connexion.authentifier()
        }

    } catch(err) {
        console.error("Erreur inscrire usager : %O", err)
        erreurCb(err, "Erreur inscrire usager")
    }
}

async function preparerUsager(workers, nomUsager, setEtatUsagerBackend, setUsagerDbLocal, erreurCb) {
    const connexion = workers.connexion
    // console.debug("Suivant avec usager %s", nomUsager)
    
    // Verifier etat du compte local. Creer ou regenerer certificat (si absent ou expire).
    let usagerLocal = await initialiserCompteUsager(nomUsager) 

    let fingerprintNouveau = null,
        fingerprintCourant = null
    if(usagerLocal) {
        fingerprintCourant = usagerLocal.fingerprintPk
        if(usagerLocal.requete) {
            fingerprintNouveau = usagerLocal.requete.fingerprintPk
        }
    }

    const etatUsagerBackend = await chargerUsager(connexion, nomUsager, fingerprintNouveau, fingerprintCourant)
    //console.debug("Etat usager backend : %O", etatUsagerBackend)
    await setEtatUsagerBackend(etatUsagerBackend)
    await setUsagerDbLocal(await usagerDao.getUsager(nomUsager))
}

export async function chargerUsager(connexion, nomUsager, fingerprintPk, fingerprintCourant) {
    //console.debug("Charger usager : nomUsager %s, fingerprintRequete : %s, fingerprintCourant %s", nomUsager, fingerprintPk, fingerprintCourant)
    const infoUsager = await connexion.getInfoUsager(nomUsager, fingerprintPk, fingerprintCourant)
    //console.debug("Reponse usager : %O", infoUsager)
    // Verifier si on peut faire un auto-login (seule methode === certificat)
    let authentifie = false
    return {infoUsager, authentifie}
}

async function fermerSession(setAuthentifier, setEtatUsagerBackend, setUsagerSessionActive) {
    const axios = await import('axios')
    try {
        await axios.get('/millegrilles/authentification/fermer')
    } catch(err) {
        console.warn("Erreur fermer session : %O", err)
    } finally {
        setAuthentifier(false)
        setEtatUsagerBackend(false)
        setUsagerSessionActive('')
    }

    try {
        await axios.get('/millegrilles/authentification/verifier')
    } catch(err) {
        const response = err.response || {}
        const status = response.status
        if(status === 401) {
            // Ok, session creee et usager n'est pas authentifie
        } else {
            console.error("Erreur verification session fermee : %O", response)
        }
    }
}
