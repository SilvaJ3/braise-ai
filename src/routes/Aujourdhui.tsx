import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Fab from '../components/Fab'
import InstallHint from '../components/InstallHint'
import Today from '../components/Today'
import { logEvent } from '../lib/events'

export default function Aujourdhui() {
  const navigate = useNavigate()

  useEffect(() => {
    logEvent('open')
  }, [])

  return (
    <>
      <h1>Aujourd'hui</h1>
      <InstallHint />
      <Today />
      <Fab onClick={() => navigate('/planning', { state: { new: true } })} />
    </>
  )
}
