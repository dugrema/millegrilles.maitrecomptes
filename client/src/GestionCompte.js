import {useState, useCallback, useEffect} from 'react'
import { base64 } from 'multiformats/bases/base64'

import Button from 'react-bootstrap/Button'
import Col from 'react-bootstrap/Col'
import Row from 'react-bootstrap/Row'
import Alert from 'react-bootstrap/Alert'
import Form from 'react-bootstrap/Form'

import {BoutonAjouterWebauthn, preparerAuthentification, signerDemandeAuthentification} from './WebAuthn'
import ChargerCleMillegrille, {authentiferCleMillegrille} from './ChargerCleMillegrille'
import {getUserIdFromCertificat, getNomUsagerCsr} from './comptesUtil'

function GestionCompte(props) {

    const { workers, setSectionAfficher, usagerDbLocal, confirmationCb, erreurCb } = props

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

    const activerDelegation = useCallback(()=>setSectionGestion('SectionActiverDelegation'), [setSectionGestion])
    const activerCompte = useCallback(()=>setSectionGestion('SectionActiverCompte'), [setSectionGestion])

    return (
        <>
            <h2>Authentification</h2>

            <Button onClick={retourCb}>Retour</Button>

            <p>Controle des methodes d'authentification pour votre compte.</p>

            <Row>
                <Col md={8}>
                    Ajouter un token d'authentification <br/>
                    (e.g. lecteur d'empreinte, token de securite USB, etc.)
                </Col>
                <Col md={4}>
                    <BoutonAjouterWebauthn 
                        workers={workers}
                        usagerDbLocal={usagerDbLocal}
                        confirmationCb={confirmationCb}
                        erreurCb={erreurCb}
                        variant="secondary">
                        Ajouter methode
                    </BoutonAjouterWebauthn>
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
        </>      
    )
}

function SectionActiverDelegation(props) {

    const {workers, usagerDbLocal, setSectionGestion, erreurCb} = props

    const [cleMillegrille, setCleMillegrille] = useState('')

    const retourCb = useCallback(()=>setSectionGestion(''), [setSectionGestion])
    const activerCb = useCallback(()=>{
        activerDelegation(workers, usagerDbLocal, cleMillegrille)
            .catch(err=>erreurCb(err))
    }, [workers, usagerDbLocal, cleMillegrille, erreurCb])

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

function SectionActiverCompte(props) {
    const {workers, usagerDbLocal, setSectionGestion, erreurCb} = props
    const {nomUsager} = usagerDbLocal

    const [code, setCode] = useState('')
    const [csr, setCsr] = useState('')
    const [nomUsagerCsr, setNomUsagerCsr] = useState('')
    const [etatUsagerBackend, setEtatUsagerBackend] = useState('')
    const [preparationWebauthn, setPreparationWebauthn] = useState('')

    const retourCb = useCallback(()=>setSectionGestion(''), [setSectionGestion])
    const verifierCb = useCallback(()=>{
        // Recuperer le CSR correspondant au compte/code
        const codeFormatte = formatterCode(code, erreurCb)
        setCode(codeFormatte)
        verifierCode(workers, codeFormatte)
            .then(csr=>setCsr(csr))
            .catch(err=>erreurCb(err))
    }, [workers, code, setCode, setCsr, erreurCb])

    const changerCodeCb = useCallback(event => {
        setCsr('')
        setNomUsagerCsr('')

        const code = event.currentTarget.value
        if(code) {
            let codeModifie = code.replaceAll('-', '')
            if(codeModifie.length > 8) {
                // Annuler changement
            } else if(code.length -1 > codeModifie.length) {
                // Annuler changement
            } else {
                setCode(code)
            }
        } else {
            setCode(code)
        }
    }, [setCode, setCsr, setNomUsagerCsr])

    const activerCodeCb = useCallback(()=>{
        console.debug("Signer CSR de l'usager %O", etatUsagerBackend)
        const {connexion} = workers
        const challengeWebauthn = etatUsagerBackend.challengeWebauthn
        const {demandeCertificat, publicKey} = preparationWebauthn
        const origin = window.location.hostname
        signerDemandeAuthentification(nomUsager, challengeWebauthn, demandeCertificat, publicKey, {connexion})
            .then(async signatureWebauthn => {
                console.debug("Resultat signature webauthn : %O", signatureWebauthn)

                const commande = {
                    demandeCertificat: signatureWebauthn.demandeCertificat,
                    clientAssertionResponse: signatureWebauthn.webauthn,
                    origin,
                    challenge: base64.encode(publicKey.challenge),
                }

                console.debug("Commande demande signature : %O", commande)

                const reponse = await connexion.signerRecoveryCsr(commande)
                console.debug("Reponse signature certificat : %O", reponse)
            })
            .catch(err=>erreurCb(err))
    }, [workers, nomUsager, etatUsagerBackend, preparationWebauthn, erreurCb])

    useEffect(()=>{
        const { connexion } = workers
        connexion.getInfoUsager(nomUsager)
            .then(etatUsagerBackend=>{
                console.debug("Etat usager backend charge : %O", etatUsagerBackend)
                setEtatUsagerBackend(etatUsagerBackend)
            })
            .catch(err=>erreurCb(err))
    }, [workers, nomUsager, setEtatUsagerBackend, erreurCb])

    // Charger le nom de l'usager dans le CSR
    useEffect(()=>{
        if(csr) {
            const nomUsagerCsr = getNomUsagerCsr(csr)
            setNomUsagerCsr(nomUsagerCsr)

            const challenge = etatUsagerBackend.challengeWebauthn

            if(nomUsager === nomUsagerCsr) {
                // Preparer la validation avec webauthn
                preparerAuthentification(nomUsager, challenge, csr, {activationTierce: true})
                    .then(resultat=>{
                        console.debug("Resultat preparation authentification: %O", resultat)
                        setPreparationWebauthn(resultat)
                    })
                    .catch(err=>erreurCb(err))
            }
        }
    }, [nomUsager, csr, etatUsagerBackend, setNomUsagerCsr, setPreparationWebauthn, erreurCb])

    const nomUsagerMatchCsr = csr?nomUsagerCsr===nomUsager:false

    return (
        <>
            <h2>Activer compte</h2>

            <Button variant="secondary" onClick={retourCb}>Retour</Button>

            <p>
                Cette section permet d'activer votre compte sur un autre appareil ou site lie a cette MilleGrille.
            </p>

            <Alert variant="info">
                <p>
                    Pour proceder, vous devez obtenir un code sur votre autre appareil ou site. 
                    Le code est genere lors d'un echec d'authentification.
                </p>

                <p>Instructions :</p>
                <ol>
                    <li>Utiliser votre autre appareil, ou ce navigateur pour aller sur le site</li>
                    <li>Choisissez/entrez votre nom d'usager</li>
                    <li>Cliquez sur suivant</li>
                    <li>Cliquez sur Annuler ou attendez 1 minute.</li>
                    <li>La page avec l'information d'activation de compte est affichee.</li>
                    <li>Revenir sur cette page et entrer le code (e.g. jdzl-a7u7) ou scanner le code QR.</li>
                </ol>
            </Alert>

            <h3>Activer avec code</h3>

            <Row>
                <Col xs={8} sm={6} md={3} lg={2}>Compte</Col>
                <Col>{nomUsager}</Col>
            </Row>
            <Row>
                <Form.Label column={true} md={2}>Code</Form.Label>
                <Col xs={8} sm={6} md={3} lg={2}>
                    <Form.Control 
                        type="text" 
                        placeholder="abcd-1234" 
                        value={code}
                        onChange={changerCodeCb} />
                </Col>
                <Col>
                    <Button variant="secondary" onClick={verifierCb}>Verifier code</Button>
                </Col>
            </Row>
            <Row>
                <Col xs={8} sm={6} md={3} lg={2}>Compte recu</Col>
                <Col>
                    {nomUsagerCsr}{' '}
                    {csr&&!nomUsagerMatchCsr?
                        'Erreur - les comptes ne correspondent pas'
                        :csr?'(OK)':''
                    }
                </Col>
            </Row>
            <Row>
                <Col>
                    <Button variant="primary" onClick={activerCodeCb} disabled={!preparationWebauthn}>
                        Activer
                    </Button>
                </Col>
            </Row>

            <h3>Scanner le code QR</h3>

            <p>Il est aussi possible d'activer en scannant le code QR affiche sur votre autre appareil.</p>

            <p>...scanneur...</p>

        </>
    )
}

async function activerDelegation(workers, usagerDbLocal, cleMillegrille) {

    const { connexion } = workers
    const { nomUsager, certificat } = usagerDbLocal

    const preuve = await authentiferCleMillegrille(workers, nomUsager, cleMillegrille, {activerDelegation: true})
    console.debug("Preuve signee : %O", preuve)

    const userId = getUserIdFromCertificat(certificat.join(''))

    const commande = {
        confirmation: preuve,
        userId,
    }
    console.debug("Commande activer delegation : %O", commande)

    const reponse = await connexion.activerDelegationParCleMillegrille(commande)
    console.debug("Reponse activerDelegation : %O", reponse)
}

function formatterCode(code, erreurCb) {
    let codeClean = code.replaceAll('-', '')
    if(codeClean.length !== 8) {
        return erreurCb('Longueur du code est invalide (doit etre 8 characteres, e.g. jdzl-a7u7)')
    }
    let code1 = codeClean.slice(0, 4),
        code2 = codeClean.slice(4)
    const codeModifie = [code1, code2].join('-')
    return codeModifie
}

async function verifierCode(workers, code) {
    const { connexion } = workers
    const reponse = await connexion.getRecoveryCsr(code)
    console.debug("Reponse verifier code : %O", reponse)
    if(reponse.ok === false) throw new Error(reponse.err)
    return reponse.csr
}
