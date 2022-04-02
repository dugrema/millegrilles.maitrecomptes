import {useState, useCallback, useEffect} from 'react'
import Dropzone from 'react-dropzone'

import Form from 'react-bootstrap/Form'
import Button from 'react-bootstrap/Button'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'

import { chargerPemClePriveeEd25519 } from '@dugrema/millegrilles.utiljs/src/certificats'

function ChargerCleMillegrille(props) {

    const {confirmationCb, erreurCb} = props

    const [cleChiffree, setCleChiffree] = useState('')
    const [motdepasse, setMotdepasse] = useState('')
    const [cleDechiffree, setCleDechiffree] = useState('')

    const changerMotdepasseCb = useCallback(event=>setMotdepasse(event.currentTarget.value))

    useEffect(()=>{
        if(cleChiffree && motdepasse) {
            try {
                const cleMillegrille = chargerPemClePriveeEd25519(cleChiffree, {password: motdepasse, pemout: true})
                console.debug("Cle privee millegrille extraite %O", cleMillegrille)
                setCleDechiffree(cleMillegrille)
            } catch(err) {
                erreurCb(err)
            }
        }
    }, [cleChiffree, motdepasse, erreurCb])

    return (
        <>
            <Row>
                <Col>
                    <ChargerCleFichier 
                        cleChiffree={cleChiffree}
                        setCleChiffree={setCleChiffree}
                        motdepasse={motdepasse}
                        setMotdepasse={changerMotdepasseCb} 
                        erreurCb={erreurCb} />
                </Col>
            </Row>

            <hr/>

            <Row>
                <Col>
                    <Button disabled={cleDechiffree?false:true}>Activer</Button>
                </Col>
            </Row>
        </>
    )
}

export default ChargerCleMillegrille

function ChargerCleFichier(props) {

    const {motdepasse, setMotdepasse, setCleChiffree, erreurCb} = props

    const recevoirCleCb = useCallback(acceptedFiles=>{
        recevoirFichierCle(acceptedFiles)
            .then(cle=>setCleChiffree(cle))
            .catch(err=>erreurCb(err, 'Erreur chargement cle'))
    }, [setCleChiffree])

    return (
        <>
            <Form.Group controlId="formMotdepasse">
                <Form.Label>Mot de passe de la cle de MilleGrille</Form.Label>
                <Form.Control
                    type="password"
                    name="motdepasse"
                    value={motdepasse}
                    autoComplete="false"
                    onChange={setMotdepasse}
                    placeholder="AAAA-bbbb-1111-2222" />
            </Form.Group>

            <p></p>

            <p>Cliquer sur le bouton suivant pour telecharger le fichier avec la cle de millegrille</p>
            <Dropzone onDrop={recevoirCleCb}>
              {({getRootProps, getInputProps}) => (
                <span className="uploadIcon btn btn-secondary">
                  <span {...getRootProps()}>
                    <input {...getInputProps()} />
                    <span className="fa fa-upload fa-2x"/>
                  </span>
                </span>
              )}
            </Dropzone>
        </>
    )    
}

async function recevoirFichierCle(acceptedFiles) {
    const resultats = await traiterUploads(acceptedFiles)
    console.debug("Resultats upload : %O", resultats)

    // Format fichier JSON : {idmg, racine: {cleChiffree, certificat}}
    let cleChiffree = null
    if(resultats.length > 0) {
        const resultat = resultats[0]
        cleChiffree = resultat.racine.cleChiffree
        return cleChiffree
    }
}

async function traiterUploads(acceptedFiles) {
    const resultats = await Promise.all(acceptedFiles.map(async file =>{
        if( file.type === 'application/json' ) {
            var reader = new FileReader()
            const fichierCharge = await new Promise((resolve, reject)=>{
                reader.onload = () => {
                    var buffer = reader.result
                    const contenuFichier =  String.fromCharCode.apply(null, new Uint8Array(buffer))
                    resolve({contenuFichier})
                }
                reader.onerror = err => reject(err)
                reader.readAsArrayBuffer(file)
            })
    
            console.debug(fichierCharge)
            const contenuJson = JSON.parse(fichierCharge.contenuFichier)
            return contenuJson
        }
    }))
    return resultats
}

function activerDelegation() {


    // if(props.appendLog) props.appendLog(`SaisirUsager conserverCle`)
    // const challengeCertificat = informationUsager.challengeCertificat
    // console.debug("Cle : %O, challengeCertificat : %O, opts: %O", cles, challengeCertificat, opts)

    // let challengeSigne = {...challengeCertificat, nomUsager, ...opts}

    // try {
    //   // Authentifier avec cle de millegrille
    //   challengeSigne = await authentiferCleMillegrille(props.workers, cles.pem, challengeSigne)
    //   console.debug("Challenge signe : %O", challengeSigne)

    //   // Eliminer la cle de la memoire
    //   workers.connexion.clearCleMillegrille()
    //     .catch(err=>{console.warn("Erreur suppression cle de MilleGrille de la memoire", err)})

    //   const reponse = await workers.connexion.authentifierCleMillegrille(challengeSigne)
    //   console.debug("Reponse authentification avec cle de millegrille : %O", reponse)
    //   if(reponse.authentifie) {
    //     props.confirmerAuthentification({...informationUsager, ...reponse})
    //   }
    //   setUtiliserMethodesAvancees(false)  // Retour
    // } catch(err) {
    //   console.error("Erreur authentification avec cle de millegrille : %O", err)
    //   setErr(<><p>Erreur authentification avec cle de millegrille:</p><p>{err}</p></>)
    //   arreterAttente()  // On a une reponse, arreter l'attente
    // }
}