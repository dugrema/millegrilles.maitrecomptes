import React, {useState, useEffect, useCallback} from 'react'
import {Row, Col, Button, Alert} from 'react-bootstrap'

import {AlertAjouterAuthentification} from './Authentifier'

export default function AccueilUsager(props) {

  return (
    <>
      <AlertAjouterAuthentification workers={props.workers}
                                    rootProps={props.rootProps} />

      <p>Accueil usager {props.rootProps.nomUsager}</p>
      <Button onClick={props.rootProps.deconnecter}>Deconnecter</Button>
    </>
  )
}
