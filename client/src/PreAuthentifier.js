import React from 'react'
import Form from 'react-bootstrap/Form'
import { Trans, useTranslation } from 'react-i18next'

function PreAuthentifier(props) {
    return (
        <>
            <p>Acces prive pour les usagers de la millegrille</p>

        
        </>
    )
}

export default PreAuthentifier

function InputAfficherListeUsagers(props) {
    const {t} = useTranslation()
  
    if(props.disabled || !props.listeUsagers) return ''
  
    const optionsUsagers = props.listeUsagers.map(nomUsager=>{
      return (
        <option value={nomUsager}>{nomUsager}</option>
      )
    })
  
    return (
      <>
        <Form.Select
          type="text"
          defaultValue={props.nomUsager}
          placeholder={t('authentification.saisirNom')}
          onChange={props.selectionnerUsager}
          disabled={props.attente || props.informationUsager}>
  
          {props.listeUsagers.map(nomUsager=>(
            <option key={nomUsager} value={nomUsager}>{nomUsager}</option>
          ))}
  
        </Form.Select>
  
        <Form.Text className="text-muted">
          <Trans>authentification.instructions2</Trans>
        </Form.Text>
      </>
    )
  }