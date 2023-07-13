import { useState, useCallback, useEffect  } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'

import base64url from 'base64url'

import { AfficherActivationsUsager, supporteCamera, BoutonActif } from '@dugrema/millegrilles.reactjs'

import useWorkers, {useUsager, useEtatPret} from './WorkerContext'

import ErrorBoundary from './ErrorBoundary';
import { preparerAuthentification, signerDemandeAuthentification } from './WebAuthn'

function SectionActiverCompte(props) {
    const {fermer, erreurCb} = props

    const usager = useUsager()
    const etatPret = useEtatPret()

    return (
        <>
            <Row>
                <Col xs={10} md={11}><h2>Activer un appareil</h2></Col>
                <Col xs={2} md={1} className="bouton">
                    <Button onClick={fermer} variant="secondary"><i className='fa fa-remove'/></Button>
                </Col>
            </Row>

            <p>
                Cette section permet d'activer votre compte sur un autre appareil ou site lie a cette MilleGrille.
            </p>

            <ActivationUsager 
                etatAuthentifie={etatPret}
                usagerDbLocal={usager}
                erreurCb={erreurCb} />

            <hr/>

            <Alert variant="dark" show={true}>
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

export default SectionActiverCompte

function ActivationUsager(props) {

    const { erreurCb } = props

    const workers = useWorkers(),
          usager = useUsager(),
          etatPret = useEtatPret()

    const { nomUsager } = usager
  
    const [supportCodeQr, setSupportCodeQr] = useState(false)
    const [csr, setCsr] = useState('')
    const [challengeOriginal, setChallengeOriginal] = useState('')
    const [preparationWebauthn, setPreparationWebauthn] = useState('')
    const [resultatActivation, setResultatActivation] = useState('')

    const csrCb = useCallback(csr=>{
      console.debug("Recu csr : %O", csr)
      setCsr(csr)
    }, [setCsr])
  
    const activerCodeCb = useCallback(()=>{
        const {connexion} = workers
        const {demandeCertificat, publicKey} = preparationWebauthn
        const origin = window.location.hostname
        
        setResultatActivation('attente')
        
        signerDemandeAuthentification(nomUsager, demandeCertificat, publicKey)
            .then(async signatureWebauthn => {
                console.debug("Resultat signature webauthn : %O", signatureWebauthn)

                const commande = {
                    demandeCertificat: signatureWebauthn.demandeCertificat,
                    clientAssertionResponse: signatureWebauthn.webauthn,
                    origin,
                    hostname: origin,
                    challenge: challengeOriginal,
                }

                console.debug("Commande demande signature : %O", commande)
                const reponse = await connexion.signerRecoveryCsr(commande)
                console.debug("Reponse signature certificat : %O", reponse)

                if(reponse.err) {
                    setResultatActivation('echec')
                    erreurCb(reponse.err, "Erreur lors de l'activation du code")
                } else {
                    setResultatActivation('succes')
                }
            })
            .catch(err=>{
                setResultatActivation('echec')
                erreurCb(err)
            })
    }, [workers, nomUsager, challengeOriginal, preparationWebauthn, setResultatActivation, erreurCb])

    useEffect(()=>{
      supporteCamera()
        .then(support=>setSupportCodeQr(support))
        .catch(err=>erreurCb(err))
    }, [setSupportCodeQr, erreurCb])
  
    // useEffect(()=>{
    //     const { connexion } = workers
    //     connexion.getInfoUsager(nomUsager, {genererChallenge: true})
    //         .then(etatUsagerBackend=>{
    //             console.debug("Etat usager backend charge : %O", etatUsagerBackend)
    //             const authentication_challenge = etatUsagerBackend.authentication_challenge
    //             preparerAuthentification(nomUsager, authentication_challenge, csr, {activationTierce: true})
    //             setEtatUsagerBackend(etatUsagerBackend)
    //         })
    //         .catch(err=>erreurCb(err))
    // }, [workers, nomUsager, csr, setEtatUsagerBackend, erreurCb])

    // Charger le nom de l'usager dans le CSR
    useEffect(()=>{
        if(csr) {
            // const nomUsagerCsr = getNomUsagerCsr(csr)
            // setNomUsagerCsr(nomUsagerCsr)
            workers.connexion.getInfoUsager(nomUsager, {genererChallenge: true})
                .then(etatUsagerBackend=>{
                    console.debug("Etat usager backend charge : %O", etatUsagerBackend)
                    return etatUsagerBackend.authentication_challenge
                })
                .then(challenge=>{
                    setChallengeOriginal(challenge.publicKey.challenge)
                    return preparerAuthentification(nomUsager, challenge, csr, {activationTierce: true})
                })
                .then(challengePrepare=>{
                    console.debug("Challenge webauthn prepare : ", challengePrepare)
                    setPreparationWebauthn(challengePrepare)
                })
                .catch(err=>erreurCb(err))
    
            // // console.debug("Preparation challenge reponse pour CSR %O : %O", csr, etatUsagerBackend)
            // const challenge = etatUsagerBackend.challengeWebauthn

            // // Preparer la validation avec webauthn
            // preparerAuthentification(nomUsager, challenge, csr, {activationTierce: true})
            //     .then(resultat=>{
            //         // console.debug("Resultat preparation authentification: %O", resultat)
            //         setPreparationWebauthn(resultat)
            //     })
            //     .catch(err=>erreurCb(err))
        }
    }, [nomUsager, csr, setPreparationWebauthn, setChallengeOriginal, erreurCb])

    return (
      <>
        <h2>Activer compte</h2>

        <ErrorBoundary>
            <AfficherActivationsUsager 
                nomUsager={nomUsager}
                workers={workers}
                supportCodeQr={supportCodeQr}
                csrCb={csrCb}
                erreurCb={erreurCb} />
        </ErrorBoundary>

        <br/>

        <Form.Group>
            <Form.Text className="text-muted">
                Saisissez un code et cliquez sur Activer.
            </Form.Text>
        </Form.Group>
        <BoutonActif 
            onClick={activerCodeCb} 
            etat={resultatActivation}
            disabled={!csr || !etatPret}>
            Activer
        </BoutonActif>
      </>
    )
}