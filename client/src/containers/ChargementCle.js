import React from 'react'
import {Row, Col, Form, Button, ProgressBar, Alert} from 'react-bootstrap'
import Dropzone from 'react-dropzone'
// import QrReader from 'react-qr-reader'

// import {chargerClePrivee} from '@dugrema/millegrilles.common/lib/forgecommon'
import {detecterAppareilsDisponibles} from '@dugrema/millegrilles.common/lib/detecterAppareils'

import { transformerClePriveeForge } from '../components/pkiHelper'

export default class ChargementClePrivee extends React.Component {

  state = {
    motdepasse: '',
    cleChiffree: '',
    challenge: '',
    reponseChallenge: '',

    modeScanQR: false,
    videoinput: false,

    resultatScan: '',

    partiesDeCle: {},
    nombrePartiesDeCle: '',
    nombrePartiesDeCleScannees: 0,

    activerDelegation: false,

    err: '',
  }

  componentDidMount() {
    detecterAppareilsDisponibles().then(apps=>{console.debug("Apps detectees : %O", apps); this.setState({...apps})})
  }

  conserverCle = async _ => {
    // Conserver cle pour reutilisation dans les fonctions de l'application
    // Note: ne peut pas etre exportee
    const cleMillegrille = await transformerClePriveeForge(this.state.cleChiffree, this.state.motdepasse, {pemout: true})
    console.debug("!!!5 Cle privee millegrille extraite : %O", cleMillegrille)
    this.props.conserverCle(cleMillegrille, {activerDelegation: this.state.activerDelegation})
  }

  changerChamp = event => {
    console.debug("Changer champ cle : %O", this.props)
    const {name, value} = event.currentTarget
    this.setState({[name]: value}, async _ =>{
      if(this.state.cleChiffree && this.state.motdepasse) {
        this.conserverCle()
      }
    })
  }

  recevoirFichiers = async acceptedFiles => {
    try {
      const resultats = await traiterUploads(acceptedFiles)
      console.debug("Resultats upload : %O", resultats)

      // Format fichier JSON : {idmg, racine: {cleChiffree, certificat}}
      if(resultats.length > 0) {
        const resultat = resultats[0]
        const cleChiffree = resultat.racine.cleChiffree
        if(cleChiffree) {
          await new Promise((resolve, reject)=>{
            this.setState({cleChiffree}, _=>{resolve()})
          })
        }

      }

      if(this.state.cleChiffree && this.state.motdepasse) {
        await this.conserverCle()
      }
    } catch(err) {
      this.setState({err: ''+err})
    }
  }

  toggleDelegation = _ => {this.setState({activerDelegation: !this.state.activerDelegation})}

  activerScanQr = _ => {this.setState({modeScanQR: true})}
  fermerScanQr = _ => {this.setState({modeScanQR: false})}
  erreurScanQr = event => {console.error("Erreur scan QR: %O", event); this.fermerScanQr()}
  handleScan = async data => {
    //console.debug("Scan : %O", data)
    if (data) {
      await new Promise((resolve, reject)=>{
        this.setState({resultatScan: data}, _=>{resolve()})
      })

      const lignesQR = data.split('\n')
      if(lignesQR.length === 1) {
        // Probablement le mot de passe
        this.setState({motdepasse: data})
      } else if(lignesQR.length === 2) {
        // Probablement une partie decle ou certificat
        var tag = lignesQR[0].split(';')
        if(tag.length === 3) {
          const type = tag[0],
                index = tag[1],  // Garder en str pour cle de dict
                count = Number(tag[2])

          if(type === 'racine.cle') {
            const partiesDeCle = {...this.state.partiesDeCle, [index]: lignesQR[1]}
            const comptePartiesDeCle = Object.keys(partiesDeCle).length
            await new Promise((resolve, reject)=>{
              this.setState({
                partiesDeCle,
                nombrePartiesDeCle: count,
                nombrePartiesDeCleScannees: comptePartiesDeCle,
              }, _=>{resolve()})
            })
          }
        }
      }

      // Verifier si on a toute l'information (mot de passe et cle)
      if( this.state.nombrePartiesDeCle === this.state.nombrePartiesDeCleScannees ) {
        // On a toutes les parties de cle, on les assemble
        const cleChiffree = assemblerCleChiffree(this.state.partiesDeCle)
        await new Promise((resolve, reject)=>{this.setState({cleChiffree}, _=>{resolve()})})
      }

      if(this.state.cleChiffree && this.state.motdepasse) {
        // Tenter de dechiffrer la cle
        this.conserverCle()
      }
    }
  }

  render() {

    if(this.state.modeScanQR) {
      return <QRCodeReader fermer={this.fermerScanQr}
                           resultatScan={this.state.resultatScan}
                           handleError={this.erreurScanQr}
                           handleScan={this.handleScan}
                           nombrePartiesDeCleTotal={this.state.nombrePartiesDeCle}
                           nombrePartiesDeCleScannees={this.state.nombrePartiesDeCleScannees}
                           motdepasse={this.state.motdepasse} />
    }

    var bontonQrScan = ''
    if(this.state.videoinput) {
      bontonQrScan = (
        <Button variant="secondary" onClick={this.activerScanQr}>
          QR Scan
        </Button>
      )
    }

    var clePrete = ''
    if(this.props.reponseCertificat) {
      clePrete = (
        <span>
          <i className="fa fa-check"/>
          Cle OK
        </span>
      )
    }

    return (
      <>
        <Alert variant="danger" show={this.state.err?true:false}>
          <Alert.Heading>Erreur</Alert.Heading>
          {this.state.err}
        </Alert>

        <Row>
          <Col><h3>Importer cle privee de MilleGrille</h3></Col>
        </Row>

        <Form.Group controlId="formDelegation">
          <Form.Check
            type="checkbox"
            name="delegation"
            label="Activer delegation proprietaire (administrateur)"
            checked={this.state.activerDelegation}
            onChange={this.toggleDelegation} />
        </Form.Group>

        <Form.Group controlId="formMotdepasse">
          <Form.Label>Mot de passe de cle</Form.Label>
          <Form.Control
            type="text"
            name="motdepasse"
            value={this.state.motdepasse}
            autoComplete="false"
            onChange={this.changerChamp}
            placeholder="AAAA-bbbb-1111-2222" />
        </Form.Group>

        <Row>
          <Col>

            <Dropzone onDrop={this.recevoirFichiers}>
              {({getRootProps, getInputProps}) => (
                <span className="uploadIcon btn btn-secondary">
                  <span {...getRootProps()}>
                    <input {...getInputProps()} />
                    <span className="fa fa-upload fa-2x"/>
                  </span>
                </span>
              )}
            </Dropzone>

            {bontonQrScan}

            {this.props.retour?
              <Button variant="secondary" onClick={this.props.retour}>Retour</Button>
              :''
            }

          </Col>
          <Col>
            {clePrete}
          </Col>
        </Row>

      </>
    )
  }

}

async function traiterUploads(acceptedFiles) {

  const resultats = await Promise.all(acceptedFiles.map(async file =>{
    if( file.type === 'application/json' ) {
      var reader = new FileReader();
      const fichierCharge = await new Promise((resolve, reject)=>{
        reader.onload = () => {
          var buffer = reader.result;
          const contenuFichier =  String.fromCharCode.apply(null, new Uint8Array(buffer));
          resolve({contenuFichier});
        }
        reader.onerror = err => {
          reject(err);
        }
        reader.readAsArrayBuffer(file);
      })

      console.debug(fichierCharge)

      const contenuJson = JSON.parse(fichierCharge.contenuFichier)

      return contenuJson
    }
  }))

  return resultats
}

function QRCodeReader(props) {

  var progresMotdepasse = 0, labelMotdepasse = 'Non charge'
  if(props.motdepasse) {
    progresMotdepasse = 100
    labelMotdepasse = 'Charge'
  }

  var progresCleMillegrille = 0
  if(props.nombrePartiesDeCleTotal) {
    progresCleMillegrille = Math.round(props.nombrePartiesDeCleScannees / props.nombrePartiesDeCleTotal * 100)
  }

  throw new Error("fix me")

  // return (
  //   <>
  //     <QrReader
  //       delay={300}
  //       onError={props.handleError}
  //       onScan={props.handleScan}
  //       style={{ width: '75%', 'text-align': 'center' }}
  //       />
  //     <Button onClick={props.fermer}>Fermer</Button>
  //
  //     <Row>
  //       <Col xs={6}>
  //         Mot de passe
  //       </Col>
  //       <Col xs={6}>
  //         <ProgressBar variant="secondary" now={progresMotdepasse} label={labelMotdepasse} />
  //       </Col>
  //     </Row>
  //
  //     <Row>
  //       <Col xs={6}>
  //         Cle de MilleGrille
  //       </Col>
  //       <Col xs={6}>
  //         <ProgressBar variant="secondary" now={progresCleMillegrille} label={`${progresCleMillegrille}%`} />
  //       </Col>
  //     </Row>
  //
  //     <pre>
  //       {props.resultatScan}
  //     </pre>
  //   </>
  // )
}

function assemblerCleChiffree(partiesDeCle) {
  var cleChiffree = '', nombreParties = Object.keys(partiesDeCle).length
  for( let idx=1; idx <= nombreParties; idx++ ) {
    cleChiffree += partiesDeCle[''+idx]
  }

  // Ajouter separateurs cle chiffree
  const DEBUT_PRIVATE_KEY = '-----BEGIN ENCRYPTED PRIVATE KEY-----\n',
        FIN_PRIVATE_KEY = '\n-----END ENCRYPTED PRIVATE KEY-----\n'
  cleChiffree = DEBUT_PRIVATE_KEY + cleChiffree + FIN_PRIVATE_KEY

  return cleChiffree
}
