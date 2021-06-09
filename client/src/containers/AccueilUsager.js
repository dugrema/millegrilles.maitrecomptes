import React, {useState, useEffect, useCallback} from 'react'
import {Row, Col, Button} from 'react-bootstrap'

export default function AccueilUsager(props) {

  const deconnecter = useCallback( _ => {

  }, [])

  return (
    <>
      <p>Accueil usager {props.rootProps.nomUsager}</p>
      <Button onClick={props.rootProps.deconnecter}>Deconnecter</Button>
    </>
  )
}
