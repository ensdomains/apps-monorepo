import { useState } from 'react'
import { Toggle } from './Toggle'

const ControlledToggle = ({ initialValue = false, ...props }) => {
  const [checked, setChecked] = useState(initialValue)
  return <Toggle checked={checked} onCheckedChange={setChecked} {...props} />
}

export default {
  Default: <Toggle />,

  WithLabel: <Toggle label="Enable notifications" />,

  WithDescription: (
    <Toggle
      label="Marketing emails"
      description="Receive emails about new products and features"
    />
  ),

  States: (
    <div className="flex flex-col gap-4">
      <Toggle label="Default state" />
      <Toggle label="Checked state" defaultChecked />
      <Toggle label="Disabled state" disabled />
      <Toggle label="Disabled checked" disabled defaultChecked />
    </div>
  ),

  Controlled: (
    <div className="flex flex-col gap-4">
      <ControlledToggle label="Controlled toggle" />
      <ControlledToggle label="Initially checked" initialValue={true} />
    </div>
  ),

  ComplexExamples: (
    <div className="flex flex-col gap-6 max-w-md">
      <Toggle
        label="Email notifications"
        description="Get notified when someone sends you an email"
      />
      <Toggle
        label="Push notifications"
        description="Get push notifications on your device"
      />
      <Toggle
        label="SMS notifications"
        description="Get text messages for important updates"
        disabled
      />
      <Toggle
        label="Marketing communications"
        description="Receive promotional content and product updates"
      />
    </div>
  ),

  SettingsPanel: (
    <div className="p-6 border rounded-lg max-w-md">
      <h3 className="text-lg font-semibold mb-4">Notification Settings</h3>
      <div className="space-y-4">
        <Toggle
          label="All notifications"
          description="Master switch for all notifications"
          defaultChecked
        />
        <div className="pl-6 space-y-3">
          <Toggle
            label="Comments"
            description="When someone comments on your posts"
            defaultChecked
          />
          <Toggle
            label="Mentions"
            description="When someone mentions you"
            defaultChecked
          />
          <Toggle label="Followers" description="When someone follows you" />
        </div>
      </div>
    </div>
  ),

  Interactive: (
    <Toggle
      label="Click me!"
      description="This toggle logs to console when changed"
      onCheckedChange={(checked) => console.log('Toggle changed:', checked)}
    />
  ),
}
