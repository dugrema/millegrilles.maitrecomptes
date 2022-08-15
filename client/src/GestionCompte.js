import {useState, useCallback, useEffect} from 'react'
import { base64 } from 'multiformats/bases/base64'

import Button from 'react-bootstrap/Button'
import Col from 'react-bootstrap/Col'
import Row from 'react-bootstrap/Row'
import Alert from 'react-bootstrap/Alert'
import Form from 'react-bootstrap/Form'

import { AfficherActivationsUsager, supporteCamera } from '@dugrema/millegrilles.reactjs'

import {BoutonAjouterWebauthn, preparerAuthentification, signerDemandeAuthentification} from './WebAuthn'
import ChargerCleMillegrille, {authentiferCleMillegrille} from './ChargerCleMillegrille'
import {getUserIdFromCertificat} from './comptesUtil'

function GestionCompte(props) {

    const { workers, etatAuthentifie, setSectionAfficher, usagerDbLocal, confirmationCb, erreurCb } = props

    const [sectionGestion, setSectionGestion] = useState('')

    const retourCb = useCallback( () => setSectionAfficher(''), [setSectionAfficher])

    let Page
    switch(sectionGestion) {
        case 'SectionActiverDelegation': Page = SectionActiverDelegation; break
        case 'SectionActiverCompte': Page = SectionActiverCompte; break
        default: Page = SectionGestionComptes
    }

    return (
        <>
            <h1>Gestion compte</h1>

            <Page 
                workers={workers}
                etatAuthentifie={etatAuthentifie}
                usagerDbLocal={usagerDbLocal}
                setSectionGestion={setSectionGestion}
                confirmationCb={confirmationCb}
                erreurCb={erreurCb}
                retourCb={retourCb}
            />
        </>
    )
}

export default GestionCompte

function SectionGestionComptes(props) {

    const {workers, usagerDbLocal, setSectionGestion, confirmationCb, erreurCb, retourCb} = props

    const [desactiverAutres, setDesactiverAutres] = useState(false)
    
    const changeDesactiverAutres = useCallback(event=>setDesactiverAutres(event.currentTarget.checked), [setDesactiverAutres])

    const activerDelegation = useCallback(()=>setSectionGestion('SectionActiverDelegation'), [setSectionGestion])
    const activerCompte = useCallback(()=>setSectionGestion('SectionActiverCompte'), [setSectionGestion])

    return (
        <>
            <h2>Authentification</h2>

            <Button onClick={retourCb}>Retour</Button>

            <p>Controle des methodes d'authentification pour votre compte.</p>

            <div className="row-options">
                <Row>
                    <Col md={8}>
                        Ajouter un token d'authentification <br/>
                        (e.g. lecteur d'empreinte, token de securite USB, etc.)
                    </Col>
                    <Col md={4}>
                        <BoutonAjouterWebauthn 
                            workers={workers}
                            usagerDbLocal={usagerDbLocal}
                            resetMethodes={desactiverAutres}
                            confirmationCb={confirmationCb}
                            erreurCb={erreurCb}
                            variant="secondary">
                            Ajouter methode
                        </BoutonAjouterWebauthn>
                        <Form.Group controlId="desactiverAutres">
                            <Form.Check onChange={changeDesactiverAutres} label="Desactiver autres methodes"/>
                        </Form.Group>
                    </Col>
                </Row>

                <Row>
                    <Col md={8}>
                        Activer un compte sur un autre appareil ou site.
                    </Col>
                    <Col md={4}>
                        <Button variant="secondary" onClick={activerCompte}>Activer compte</Button>
                    </Col>
                </Row>  

                <Row>
                    <Col md={8}>
                        Activer delegation globale (administrateur).
                    </Col>
                    <Col md={4}>
                        <Button variant="secondary" onClick={activerDelegation}>Activer delegation</Button>
                    </Col>
                </Row>  
            </div>
        </>      
    )
}

export function SectionActiverDelegation(props) {

    const {workers, usagerDbLocal, setSectionGestion, confirmationCb, erreurCb} = props

    const [cleMillegrille, setCleMillegrille] = useState('')

    const retourCb = useCallback(()=>setSectionGestion(''), [setSectionGestion])
    const activerCb = useCallback(()=>{
        activerDelegation(workers, usagerDbLocal, cleMillegrille)
            .then(()=>confirmationCb('Delegation activee avec succes'))
            .catch(err=>erreurCb(err))
    }, [workers, usagerDbLocal, cleMillegrille, confirmationCb, erreurCb])

    return (
        <>
            <h2>Activer delegation</h2>

            <Button variant="secondary" onClick={retourCb}>Retour</Button>

            <p>
                Cette section permet d'utiliser la cle de millegrille pour ajouter une delegation globale
                de type proprietaire (administrateur). 
            </p>

            <ChargerCleMillegrille 
                setCleMillegrille={setCleMillegrille}
                erreurCb={erreurCb} />

            <hr />

            <Alert show={cleMillegrille?true:false} variant="primary">
                <Alert.Heading>Cle prete</Alert.Heading>
                La cle de MilleGrille est prete. Cliquez sur Activer pour ajouter le role 
                de delegation globale a votre compte.
            </Alert>

            <Button disabled={cleMillegrille?false:true} onClick={activerCb}>Activer</Button>
        </>
    )
}

export function SectionActiverCompte(props) {
    const {workers, usagerDbLocal, etatAuthentifie, setSectionGestion, confirmationCb, erreurCb} = props

    const retourCb = useCallback(()=>setSectionGestion(''), [setSectionGestion])

    return (
        <>
            <Button variant="secondary" onClick={retourCb}>Retour</Button>

            <p>
                Cette section permet d'activer votre compte sur un autre appareil ou site lie a cette MilleGrille.
            </p>

            <ActivationUsager 
                etatAuthentifie={etatAuthentifie}
                usagerDbLocal={usagerDbLocal}
                workers={workers}
                confirmationCb={confirmationCb}
                erreurCb={erreurCb} />

            <hr/>

            <Alert variant="info" show={true}>
                <Alert.Heading>Instructions</Alert.Heading>
                <p>
                    Pour proceder, vous devez obtenir un code sur votre autre appareil ou site. 
                    Le code est genere lors d'un echec d'authentification.
                </p>

                <ol>
                    <li>Utiliser votre autre appareil, ou ce navigateur pour aller sur le site</li>
                    <li>Choisissez/entrez votre nom d'usager</li>
                    <li>Cliquez sur suivant</li>
                    <li>Cliquez sur Annuler ou attendez 1 minute.</li>
                    <li>La page avec l'information d'activation de compte est affichee.</li>
                    <li>Revenir sur cette page et entrer le code (e.g. jdzl-a7u7) ou scanner le code QR.</li>
                </ol>
            </Alert>

        </>
    )
}

export function ActivationUsager(props) {

    const { workers, usagerDbLocal, confirmationCb, erreurCb, etatAuthentifie } = props
    const { nomUsager } = usagerDbLocal
  
    const [supportCodeQr, setSupportCodeQr] = useState(false)
    const [csr, setCsr] = useState('')
    const [etatUsagerBackend, setEtatUsagerBackend] = useState('')
    const [preparationWebauthn, setPreparationWebauthn] = useState('')

    const csrCb = useCallback(csr=>{
      console.debug("Recu csr : %O", csr)
      setCsr(csr)
    }, [setCsr])
  
    const activerCodeCb = useCallback(()=>{
        // console.debug("Signer CSR de l'usager %O", etatUsagerBackend)
        const {connexion} = workers
        const challengeWebauthn = etatUsagerBackend.challengeWebauthn
        const {demandeCertificat, publicKey} = preparationWebauthn
        const origin = window.location.hostname
        signerDemandeAuthentification(nomUsager, challengeWebauthn, demandeCertificat, publicKey, {connexion})
            .then(async signatureWebauthn => {
                // console.debug("Resultat signature webauthn : %O", signatureWebauthn)

                const commande = {
                    demandeCertificat: signatureWebauthn.demandeCertificat,
                    clientAssertionResponse: signatureWebauthn.webauthn,
                    origin,
                    challenge: base64.encode(publicKey.challenge),
                }

                //console.debug("Commande demande signature : %O", commande)
                const reponse = await connexion.signerRecoveryCsr(commande)
                // console.debug("Reponse signature certificat : %O", reponse)

                if(reponse.err) erreurCb(reponse.err, "Erreur lors de l'activation du code")
                else confirmationCb('Code active avec succes.')
            })
            .catch(err=>erreurCb(err))
    }, [workers, nomUsager, etatUsagerBackend, preparationWebauthn, confirmationCb, erreurCb])

    useEffect(()=>{
      supporteCamera()
        .then(support=>setSupportCodeQr(support))
        .catch(err=>erreurCb(err))
    }, [setSupportCodeQr, erreurCb])
  
    useEffect(()=>{
        const { connexion } = workers
        connexion.getInfoUsager(nomUsager)
            .then(etatUsagerBackend=>{
                // console.debug("Etat usager backend charge : %O", etatUsagerBackend)
                setEtatUsagerBackend(etatUsagerBackend)
            })
            .catch(err=>erreurCb(err))
    }, [workers, nomUsager, setEtatUsagerBackend, erreurCb])

    // Charger le nom de l'usager dans le CSR
    useEffect(()=>{
        if(csr) {
            // const nomUsagerCsr = getNomUsagerCsr(csr)
            // setNomUsagerCsr(nomUsagerCsr)

            // console.debug("Preparation challenge reponse pour CSR %O : %O", csr, etatUsagerBackend)
            const challenge = etatUsagerBackend.challengeWebauthn

            // Preparer la validation avec webauthn
            preparerAuthentification(nomUsager, challenge, csr, {activationTierce: true})
                .then(resultat=>{
                    // console.debug("Resultat preparation authentification: %O", resultat)
                    setPreparationWebauthn(resultat)
                })
                .catch(err=>erreurCb(err))
        }
    }, [nomUsager, csr, etatUsagerBackend, setPreparationWebauthn, erreurCb])

    return (
      <>
        <h2>Activer compte</h2>
        <AfficherActivationsUsager 
          nomUsager={nomUsager}
          workers={props.workers}
          supportCodeQr={supportCodeQr}
          csrCb={csrCb}
          erreurCb={erreurCb} />

        <br/>

        <Form.Group>
            <Form.Text className="text-muted">
                Saisissez un code et cliquez sur Activer.
            </Form.Text>
        </Form.Group>
        <Button onClick={activerCodeCb} disabled={!csr || !etatAuthentifie}>Activer</Button>
      </>
    )
  }

async function activerDelegation(workers, usagerDbLocal, cleMillegrille) {

    const { connexion } = workers
    const { nomUsager, certificat } = usagerDbLocal

    const preuve = await authentiferCleMillegrille(workers, nomUsager, cleMillegrille, {activerDelegation: true})
    // console.debug("Preuve signee : %O", preuve)

    const userId = getUserIdFromCertificat(certificat.join(''))

    const commande = {
        confirmation: preuve,
        userId,
    }
    // console.debug("Commande activer delegation : %O", commande)

    const reponse = await connexion.activerDelegationParCleMillegrille(commande)
    if(reponse.err) throw new Error(reponse.err)

    return reponse
}
