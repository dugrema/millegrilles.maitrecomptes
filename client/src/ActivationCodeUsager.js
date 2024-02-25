import React, {useState, useEffect, useCallback} from 'react'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Tab from 'react-bootstrap/Tab'
import Tabs from 'react-bootstrap/Tabs'

import { pki } from '@dugrema/node-forge'

import { BoutonActif, QrCodeScanner } from '@dugrema/millegrilles.reactjs'

function AfficherActivationsUsager(props) {
    const {workers, nomUsager, csrCb, supportCodeQr, erreurCb} = props
  
    const [csr, setCsr] = useState('')

    // Charger le nom de l'usager dans le CSR
    useEffect(()=>{
        if(csr) {
            const nomUsagerCsr = getNomUsagerCsr(csr)

            if(nomUsagerCsr!==nomUsager) {
                erreurCb(`Le code recu (${nomUsagerCsr}) ne correspond pas au compte ${nomUsager}`)
                return
            }

            if(nomUsager === nomUsagerCsr) {
                csrCb(csr)
            }

            setCsr('')  // Reset
        }
    }, [nomUsager, csr, csrCb, erreurCb])
  
    return (
        <div>
            <SelecteurSaisie
                workers={workers}
                nomUsager={nomUsager}
                supportCodeQr={supportCodeQr}
                setCsr={setCsr}
                erreurCb={erreurCb} />
            <br />
        </div>
    )
}

export default AfficherActivationsUsager

function SelecteurSaisie(props) {
    const { supportCodeQr, workers, nomUsager, csr, setCsr, setNomUsagerCsr, erreurCb } = props

    const [etatBouton, setEtatBouton] = useState('')
    const [showScanner, setShowScanner] = useState(false)
    const showScannerOn = useCallback(()=>setShowScanner(true))

    const verifierCodeHandler = useCallback(code => {
        console.debug("verifierCodeHandler code %O", code)
        // Recuperer le CSR correspondant au compte/code
        setEtatBouton('attente')
        const codeFormatte = formatterCode(code, erreurCb)
        if(!codeFormatte) {
            setEtatBouton('echec')
            return
        }
        verifierCode(workers, codeFormatte, nomUsager)
            .then(csr=>{
                if(csr) {
                    setEtatBouton('succes')
                    setCsr(csr)
                } else {
                    setEtatBouton('echec')
                }
            })
            .catch(err=>{
                console.warn("ActivationCodeUsager.AfficherActivationsUsager - s'assurer d'avoir une methode connexion.getRecoveryCsr(code)")
                setEtatBouton('echec')
                erreurCb(err)
            })
    }, [workers, nomUsager, csr, setCsr, setEtatBouton, erreurCb])

    return (
        <CodeTexte 
            nomUsager={nomUsager}
            etatBouton={etatBouton}
            onChange={verifierCodeHandler}
            erreurCb={erreurCb} 
            supportCodeQr={supportCodeQr} />
    )
}

function CodeTexte(props) {

    const { nomUsager, erreurCb, onChange, etatBouton, supportCodeQr } = props
 
    const [code, setCode] = useState('')

    const changerCodeHandler = useCallback(e => setCode(e.currentTarget.value), [setCode])
    const onChangeHandler = useCallback(()=>onChange(code), [code, onChange])
    const onScanHandler = useCallback(code=>{
        setCode(code)
        onChange(code)
    }, [code, onChange])

    return (
        <div>
            <Row>
                <Col sm={6} md={3} lg={2}>Compte</Col>
                <Col>{nomUsager}</Col>
            </Row>
            <Row>
                <Form.Label column={true} md={2}>Code</Form.Label>
                <Col sm={6} md={3} lg={2}>
                    <Form.Control 
                        type="text" 
                        placeholder="abcd-1234" 
                        value={code}
                        onChange={changerCodeHandler} />
                </Col>
                <Col>
                    <BoutonActif 
                        variant="secondary" 
                        etat={etatBouton} 
                        onClick={onChangeHandler}>
                            Verifier code
                    </BoutonActif>
                </Col>
                {supportCodeQr?
                    <Col>
                    <ScannerCodeActivation 
                        nomUsager={nomUsager}
                        etatBouton={etatBouton}
                        onScan={onScanHandler}
                        onError={erreurCb} 
                        label='Scan' />
                    </Col>
                :''}
            </Row>
        </div>
    )
}

function ScannerCodeActivation(props) {
    const { nomUsager, label, onScan, onError } = props

    const handlerScan = useCallback((data, _dataJson) => {
        try {
            const valeur = JSON.parse(data)
            console.debug("Valeur parsed ", valeur)
            if(valeur.nomUsager !== nomUsager) {
                onError('Mauvais nom usager')
                return 
            }
            onScan(valeur.code)
        } catch(err) {
            if(onError) onError(err, 'ScannerCodeCsr Erreur lecture CSR')
        }
    }, [nomUsager])

    return (
        <QrCodeScanner 
            label={label}
            onScan={handlerScan}
            onError={onError} />
    )
}

function formatterCode(code, erreurCb, opts) {
    opts = opts || {}
    const joinToken = opts.joinToken!==undefined?opts.joinToken:'-'
    let codeClean = code.replaceAll('-', '')
    if(codeClean.length !== 8) {
        return erreurCb('Longueur du code est invalide (doit etre 8 characteres, e.g. jdzl-a7u7)')
    }
    let code1 = codeClean.slice(0, 4),
        code2 = codeClean.slice(4)
    
    const codeModifie = [code1, code2].join(joinToken)
    return codeModifie
}
  
async function verifierCode(workers, code, nomUsager) {
    const { connexion } = workers
    const reponse = await connexion.getRecoveryCsr(code, nomUsager)
    if(reponse.ok === false) throw new Error(reponse.err)
    return reponse.csr
}
  
export function getNomUsagerCsr(csrPem) {
    console.debug("getNomUsagerCsr CSR Pem : %O", csrPem)
    try {
        const csrForge = pki.certificationRequestFromPem(csrPem)
        console.debug("getNomUsagerCsr CSR forge : ", csrForge)
        const cn = csrForge.subject.getField('CN').value
        return cn
    } catch(err) {
        console.warn("Erreur chargement CSR : %O", err)
        return null
    }
}
  