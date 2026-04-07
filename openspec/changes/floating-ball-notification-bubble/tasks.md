## 1. SessionStore Extension (session-intervention-detector)

- [x] 1.1 Add `Intervention` type to session-monitor types
- [x] 1.2 Add `getPendingInterventions()` method to SessionStore
- [x] 1.3 Add intervention list caching in SessionStore
- [x] 1.4 Update intervention list on phase transitions (waitingForApproval/waitingForInput)
- [x] 1.5 Remove from intervention list when phase exits or session ends
- [x] 1.6 Add `onInterventionChange(callback)` hook for external listeners

## 2. Main Process Bubble Controller

- [x] 2.1 Create `BubbleController` module in main process
- [x] 2.2 Subscribe to intervention changes from SessionStore
- [x] 2.3 Monitor panel window visibility state
- [x] 2.4 Implement bubble show/hide logic based on panel visibility + intervention count
- [x] 2.5 Handle `panel:navigate-to-session` IPC message from ball window
- [x] 2.6 Implement `ensurePanelVisible()` function
- [x] 2.7 Forward navigation command to panel renderer via `navigate-to-tab`
- [x] 2.8 Hide bubble after successful navigation

## 3. Preload IPC Channels

- [x] 3.1 Add `bubble:show` to preload expose (Main → Ball)
- [x] 3.2 Add `bubble:hide` to preload expose (Main → Ball)
- [x] 3.3 Add `panel:navigate-to-session` to preload expose (Ball → Main)
- [x] 3.4 Add `navigate-to-tab` to preload expose (Main → Panel)
- [x] 3.5 Add `onBubbleShow` listener registration in electronAPI
- [x] 3.6 Add `onBubbleHide` listener registration in electronAPI
- [x] 3.7 Add `onNavigateToTab` listener registration in electronAPI

## 4. Notification Bubble UI (notification-bubble)

- [x] 4.1 Create `NotificationBubble.tsx` component
- [x] 4.2 Implement bubble positioning above floating ball
- [x] 4.3 Add intervention row list rendering
- [x] 4.4 Display project name and status label per row
- [x] 4.5 Add color coding (orange for approval, blue for input)
- [x] 4.6 Implement maximum height with overflow handling (5 rows max)
- [x] 4.7 Add "+N more" indicator when exceeding max rows
- [x] 4.8 Add row click handlers
- [x] 4.9 Send IPC message on row click to open panel and navigate
- [x] 4.10 Style bubble with CSS (rounded corners, shadow, etc.)

## 5. Floating Ball Integration

- [x] 5.1 Add bubble state management in FloatingBall component
- [x] 5.2 Subscribe to `bubble:show` IPC events
- [x] 5.3 Subscribe to `bubble:hide` IPC events
- [x] 5.4 Pass intervention data to NotificationBubble component
- [x] 5.5 Ensure bubble doesn't interfere with drag operations
- [x] 5.6 Handle bubble click-through properly

## 6. Panel Window Navigation (bubble-click-navigation)

- [x] 6.1 Add `navigate-to-tab` IPC handler in ChatPanel
- [x] 6.2 Implement session tab activation if exists
- [x] 6.3 Implement session tab creation if not exists
- [x] 6.4 Ensure tab switch animation/transition
- [x] 6.5 Focus panel window after navigation

## 7. Testing & Validation

- [x] 7.1 Test intervention detection with waitingForApproval state
- [x] 7.2 Test intervention detection with waitingForInput state
- [x] 7.3 Test bubble appears when panel closed
- [x] 7.4 Test bubble hides when panel opens
- [x] 7.5 Test bubble hides when all interventions resolved
- [x] 7.6 Test click navigation to existing tab
- [x] 7.7 Test click navigation creates new tab
- [x] 7.8 Test multiple interventions display correctly
- [x] 7.9 Test screen boundary handling for bubble position
- [x] 7.10 Test drag operations work with bubble visible

## 8. Polish & Documentation

- [x] 8.1 Add CSS transitions for bubble show/hide
- [x] 8.2 Add hover effects for intervention rows
- [x] 8.3 Update CHANGELOG.md
- [x] 8.4 Add JSDoc comments to new public methods
- [x] 8.5 Clean up debug console.log statements
