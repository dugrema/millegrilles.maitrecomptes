import {useState, useCallback, useEffect} from 'react'
import Dropzone from 'react-dropzone'

import Form from 'react-bootstrap/Form'

import { chargerPemClePriveeEd25519 } from '@dugrema/millegrilles.utiljs/src/certificats'
import { SignateurMessageEd25519 } from '@dugrema/millegrilles.utiljs/src/formatteurMessage'

function ChargerCleMillegrille(props) {

    const {setCleMillegrille, erreurCb} = props

    const [cleChiffree, setCleChiffree] = useState('')
    const [motdepasse, setMotdepasse] = useState('')

    const changerMotdepasseCb = useCallback(event=>setMotdepasse(event.currentTarget.value), [setMotdepasse])

    useEffect(()=>{
        if(cleChiffree && motdepasse) {
            try {
                const cleMillegrille = chargerPemClePriveeEd25519(cleChiffree, {password: motdepasse, pemout: true})
                console.debug("Cle privee millegrille extraite %O", cleMillegrille)
                setCleMillegrille(cleMillegrille)
            } catch(err) {
                erreurCb(err)
            }
        }
    }, [cleChiffree, motdepasse, setCleMillegrille, erreurCb])

    return (
        <ChargerCleFichier 
            cleChiffree={cleChiffree}
            setCleChiffree={setCleChiffree}
            motdepasse={motdepasse}
            setMotdepasse={changerMotdepasseCb} 
            erreurCb={erreurCb} />
    )
}

export default ChargerCleMillegrille

function ChargerCleFichier(props) {

    const {motdepasse, setMotdepasse, cleChiffree, setCleChiffree, erreurCb} = props

    const recevoirCleCb = useCallback(acceptedFiles=>{
        recevoirFichierCle(acceptedFiles)
            .then(cle=>setCleChiffree(cle))
            .catch(err=>erreurCb(err, 'Erreur chargement cle'))
    }, [setCleChiffree, erreurCb])

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
            {cleChiffree?<span>Fichier charge</span>:''}
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

export async function authentiferCleMillegrille(workers, nomUsager, cle, opts) {
    opts = opts || {}
    console.debug("authentiferCleMillegrille : %O", cle)

    const { activerDelegation } = opts

    const connexion = workers.connexion

    // Recuperer le challenge de certificat courant pour l'usager
    const infoUsager = await connexion.getInfoUsager(nomUsager)

    console.debug("Information usager recue : %O", infoUsager)
    const challengeCertificat = infoUsager.challengeCertificat

    const reponseCertificat = {
      ...challengeCertificat,
      nomUsager,
    }
    if(activerDelegation) reponseCertificat.activerDelegation = true
  
    // await connexionWorker.chargerCleMillegrille(cles)
    // console.debug("Cle de millegrille chargee, signer le message : %O", reponseCertificat)
  
    // const signature = await connexionWorker.signerMessageCleMillegrille(reponseCertificat)
    // console.debug("signerMessage: signature avec cle de millegrille : %O", signature)
  
    const signateur = new SignateurMessageEd25519(cle)
    const signature = await signateur.signer(reponseCertificat)

    reponseCertificat['_signature'] = signature

    return reponseCertificat
}
