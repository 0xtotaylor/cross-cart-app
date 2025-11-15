'use client'

import { useConversation } from '@elevenlabs/react'
import { HomeIcon, Receipt, SettingsIcon, Shirt } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'

import { Dock, DockIcon, DockItem, DockLabel } from '@/components/ui/dock'
import { Orb, type AgentState } from '@/components/ui/orb'

const BASE_ORB_COLORS: [string, string] = ['#CADCFC', '#5F8FD3']
const ACTIVE_ORB_COLORS: [string, string] = ['#FFFFFF', '#F56565']

type Screen = 'intake' | 'wardrobe' | 'transactions' | 'settings'

const dockItems: Array<{
  title: string
  icon: React.ReactNode
  screen: Screen
}> = [
  {
    title: 'Home',
    icon: (
      <HomeIcon className="h-full w-full text-neutral-600 dark:text-neutral-300" />
    ),
    screen: 'intake',
  },
  {
    title: 'Closet',
    icon: (
      <Shirt className="h-full w-full text-neutral-600 dark:text-neutral-300" />
    ),
    screen: 'wardrobe',
  },
  {
    title: 'Transactions',
    icon: (
      <Receipt className="h-full w-full text-neutral-600 dark:text-neutral-300" />
    ),
    screen: 'transactions',
  },
  {
    title: 'settings',
    icon: (
      <SettingsIcon className="h-full w-full text-neutral-600 dark:text-neutral-300" />
    ),
    screen: 'settings',
  },
]

export function AppDock({
  setScreen,
  onSearchWardrobe,
  onFinalizeWardrobe,
  onEquipSlot,
}: {
  setScreen: (screen: Screen) => void
  onSearchWardrobe: (params: {
    query?: string
    limit?: number
  }) => Promise<string | undefined>
  onFinalizeWardrobe: () => string | Promise<string>
  onEquipSlot: (params: {
    slotId?: string
    productId?: string
    productName?: string
  }) => Promise<string>
}) {
  const [orbColors, setOrbColors] = useState<[string, string]>(BASE_ORB_COLORS)
  const [agentState, setAgentState] = useState<AgentState>(null)
  const [isStartingConversation, setIsStartingConversation] = useState(false)
  const [isConversationActive, setIsConversationActive] = useState(false)

  const conversation = useConversation({
    clientTools: {
      setScreen: ({ screen: screenParam }: { screen?: string }) => {
        const normalized = screenParam?.trim().toLowerCase()
        const allowed: Screen[] = [
          'intake',
          'wardrobe',
          'transactions',
          'settings',
        ]
        const target = allowed.includes(normalized as Screen)
          ? (normalized as Screen)
          : 'intake'
        setScreen(target)
        return `Screen set to ${target}.`
      },
      setWardrobeSearch: async ({
        query,
        limit,
      }: {
        query?: string
        limit?: number
      }) => {
        try {
          return (
            (await onSearchWardrobe({ query, limit })) ||
            'Wardrobe search updated.'
          )
        } catch (error) {
          console.error('Failed to run wardrobe search tool:', error)
          return 'Wardrobe search failed.'
        }
      },
      finalizeWardrobePrep: async () => {
        try {
          return await onFinalizeWardrobe()
        } catch (error) {
          console.error('Failed to finalize wardrobe intake:', error)
          return 'Wardrobe could not be opened.'
        }
      },
      equipWardrobeSlot: async ({
        slotId,
        productId,
        productName,
      }: {
        slotId?: string
        productId?: string
        productName?: string
      }) => {
        try {
          return await onEquipSlot({ slotId, productId, productName })
        } catch (error) {
          console.error('Failed to equip wardrobe slot:', error)
          return 'Unable to equip that item right now.'
        }
      },
    },
    onConnect: () => {
      setAgentState('listening')
    },
    onDisconnect: () => {
      setOrbColors(BASE_ORB_COLORS)
      setAgentState(null)
      setIsConversationActive(false)
      setIsStartingConversation(false)
    },
    onError: () => {
      setOrbColors(BASE_ORB_COLORS)
      setAgentState(null)
      setIsConversationActive(false)
      setIsStartingConversation(false)
    },
    onModeChange: ({ mode }) => {
      setAgentState(mode === 'speaking' ? 'talking' : 'listening')
    },
    onMessage: ({ source }) => {
      if (source === 'ai') {
        setAgentState('thinking')
      } else {
        setAgentState('listening')
      }
    },
  })

  const { leadingItems, trailingItems } = useMemo(() => {
    const midpoint = Math.floor(dockItems.length / 2)
    return {
      leadingItems: dockItems.slice(0, midpoint),
      trailingItems: dockItems.slice(midpoint),
    }
  }, [])

  const handleStopVoiceAgent = useCallback(async () => {
    setIsStartingConversation(false)
    try {
      await conversation.endSession()
    } catch (error) {
      console.error('Failed to end ElevenLabs conversation:', error)
    } finally {
      setIsConversationActive(false)
      setAgentState(null)
      setOrbColors(BASE_ORB_COLORS)
    }
  }, [conversation])

  const handleToggleVoiceAgent = useCallback(async () => {
    if (isConversationActive) {
      await handleStopVoiceAgent()
      return
    }

    if (isStartingConversation) return

    const agentId = process.env.NEXT_PUBLIC_ELEVEN_AGENT_ID
    if (!agentId) {
      window.alert(
        'Voice agent unavailable: missing NEXT_PUBLIC_ELEVEN_AGENT_ID.',
      )
      return
    }

    const confirmed = window.confirm(
      'To chat with the Cross Cart stylist we need access to your microphone so you can speak naturally. Continue and allow microphone access?',
    )
    if (!confirmed) return

    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      window.alert('Microphone access is not supported in this environment.')
      return
    }

    try {
      setOrbColors(ACTIVE_ORB_COLORS)
      setAgentState('thinking')
      await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      window.alert(
        'We need microphone access to start the voice conversation. Please enable access and try again.',
      )
      setOrbColors(BASE_ORB_COLORS)
      setAgentState(null)
      return
    }

    setIsStartingConversation(true)
    try {
      await conversation.startSession({
        agentId,
        connectionType: 'webrtc',
        dynamicVariables: {
          user_name: 'Tommy',
        },
      })
      setIsConversationActive(true)
    } catch {
      window.alert(
        'Could not start the ElevenLabs conversation. Please try again in a moment.',
      )
      setOrbColors(BASE_ORB_COLORS)
      setAgentState(null)
      setIsConversationActive(false)
    } finally {
      setIsStartingConversation(false)
    }
  }, [
    conversation,
    handleStopVoiceAgent,
    isConversationActive,
    isStartingConversation,
  ])

  return (
    <div className="absolute bottom-2 left-1/2 max-w-full -translate-x-1/2">
      <Dock className="items-end pb-3">
        {leadingItems.map((item) => (
          <DockItem
            key={item.title}
            className="aspect-square rounded-full bg-gray-200 dark:bg-neutral-800"
            onClick={() => {
              if (item.screen === 'transactions') {
                window.open(
                  'https://app.paywithlocus.com/dashboard/transactions',
                  '_blank',
                )
              } else {
                setScreen(item.screen)
              }
            }}>
            <DockLabel>{item.title}</DockLabel>
            <DockIcon>{item.icon}</DockIcon>
          </DockItem>
        ))}

        <div
          className="relative aspect-square w-12 cursor-pointer overflow-hidden rounded-full border border-white/70 bg-gradient-to-br from-slate-50 to-slate-200 p-[3px] shadow-lg dark:border-neutral-700 dark:from-neutral-800 dark:to-neutral-900"
          onClick={handleToggleVoiceAgent}
          title={
            isConversationActive
              ? 'End voice stylist'
              : isStartingConversation
                ? 'Connecting…'
                : 'Voice Stylist'
          }>
          <div className="h-full w-full overflow-hidden rounded-full bg-white dark:bg-neutral-900">
            <Orb
              className="h-full w-full"
              colors={orbColors}
              agentState={agentState}
            />
          </div>
        </div>

        {trailingItems.map((item) => (
          <DockItem
            key={item.title}
            className="aspect-square rounded-full bg-gray-200 dark:bg-neutral-800"
            onClick={() => {
              if (item.screen === 'transactions') {
                window.open(
                  'https://app.paywithlocus.com/dashboard/transactions',
                  '_blank',
                )
              } else {
                setScreen(item.screen)
              }
            }}>
            <DockLabel>{item.title}</DockLabel>
            <DockIcon>{item.icon}</DockIcon>
          </DockItem>
        ))}
      </Dock>
    </div>
  )
}
