"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft01Icon,
  Copy01Icon,
  Logout01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { useDisconnect } from "wagmi"

import { ProfileAvatar } from "@/components/arctic/profile-avatar"
import { PageHeader } from "@/components/arctic/page-header"
import { Icon } from "@/components/arctic/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useProfile } from "@/lib/profile-store"

const AVATAR_COLORS = [
  "bg-violet-500",
  "bg-blue-500",
  "bg-cyan-500",
  "bg-teal-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-pink-500",
  "bg-indigo-500",
  "bg-sky-500",
]

export default function ProfilePage() {
  const { profile, updateProfile } = useProfile()
  const { disconnect } = useDisconnect()
  const [name, setName] = React.useState("")
  const [dirty, setDirty] = React.useState(false)

  React.useEffect(() => {
    if (!profile) return
    const id = setTimeout(() => {
      setName(profile.displayName)
      setDirty(false)
    }, 0)
    return () => clearTimeout(id)
  }, [profile])

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) return
    updateProfile({ displayName: trimmed })
    setDirty(false)
    toast.success("Profile updated")
  }

  function handleColorPick(color: string) {
    updateProfile({ avatarColor: color })
    toast.success("Avatar updated")
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <Icon icon={UserIcon} size={32} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Connect a wallet to view your profile.</p>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Profile"
        description="Your wallet identity on Arctic."
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <Icon icon={ArrowLeft01Icon} size={14} className="mr-1" />
              Back
            </Link>
          </Button>
        }
      />

      <div className="max-w-md space-y-6">
        {/* Avatar + color picker */}
        <div className="glass rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-4">
            <ProfileAvatar
              displayName={profile.displayName}
              avatarColor={profile.avatarColor}
              size="lg"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium">Avatar colour</p>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorPick(color)}
                    className={`size-6 rounded-full ${color} ring-offset-background transition-all ${
                      profile.avatarColor === color
                        ? "ring-2 ring-primary ring-offset-2"
                        : "hover:scale-110"
                    }`}
                    aria-label={color}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Display name */}
        <div className="glass rounded-xl p-5 space-y-3">
          <label className="text-sm font-medium" htmlFor="displayName">
            Display name
          </label>
          <div className="flex gap-2">
            <Input
              id="displayName"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setDirty(true)
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              maxLength={40}
              placeholder="Your name"
              className="flex-1"
            />
            <Button onClick={handleSave} disabled={!dirty || !name.trim()}>
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This name is stored locally in your browser. Only you see it.
          </p>
        </div>

        {/* Wallet address */}
        <div className="glass rounded-xl p-5 space-y-3">
          <p className="text-sm font-medium">Wallet address</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-xs">
              {profile.address}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                navigator.clipboard?.writeText(profile.address)
                toast.success("Address copied")
              }}
            >
              <Icon icon={Copy01Icon} size={14} />
            </Button>
          </div>
        </div>

        {/* Disconnect */}
        <Button
          variant="outline"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => disconnect()}
        >
          <Icon icon={Logout01Icon} size={14} className="mr-2" />
          Disconnect wallet
        </Button>
      </div>
    </>
  )
}
