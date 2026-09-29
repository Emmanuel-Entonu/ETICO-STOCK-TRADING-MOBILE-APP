module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: { '@': './src' },
        },
      ],
      [
        'react-native-iconify/babel',
        {
          icons: [
            // ── UI chrome ─────────────────────────────────────────────
            'solar:alt-arrow-left-linear',
            'solar:alt-arrow-right-linear',
            'solar:arrow-down-bold',
            'solar:arrow-down-linear',
            'solar:arrow-up-bold',
            'solar:arrow-up-linear',
            'solar:bell-linear',
            'solar:box-linear',
            'solar:close-circle-bold',
            'solar:close-square-linear',
            'solar:cloud-upload-linear',
            'solar:danger-circle-bold',
            'solar:eye-closed-linear',
            'solar:eye-linear',
            'solar:info-circle-linear',
            'solar:refresh-linear',
            'solar:magnifer-linear',
            'solar:magnifer-zoom-in-linear',

            // ── Navigation ────────────────────────────────────────────
            'solar:home-2-linear',
            'solar:home-2-bold',
            'solar:pie-chart-2-linear',
            'solar:pie-chart-2-bold',
            'solar:user-linear',
            'solar:user-bold',

            // ── Documents / KYC ───────────────────────────────────────
            'solar:document-linear',
            'solar:document-text-linear',
            'solar:document-text-bold',
            'solar:document-add-bold',
            'solar:calendar-mark-bold',
            'solar:check-read-bold',

            // ── Cards / wallet ────────────────────────────────────────
            'solar:card-2-linear',
            'solar:card-2-bold',
            'solar:wallet-money-linear',
            'solar:wallet-money-bold',
            'solar:wallet-linear',
            'solar:hand-money-linear',
            'solar:bag-check-bold',
            'solar:money-bag-bold',
            'solar:copy-linear',
            'solar:danger-triangle-bold',
            'solar:star-linear',
            'solar:star-bold',
            'solar:arrow-right-linear',

            // ── Security ──────────────────────────────────────────────
            'solar:lock-password-linear',
            'solar:shield-check-bold',
            'solar:shield-user-bold',
            'solar:shield-warning-bold',

            // ── Theme / system ────────────────────────────────────────
            'solar:sun-linear',
            'solar:moon-linear',
            'solar:smartphone-linear',

            // ── Categories / market filters ───────────────────────────
            'solar:chart-2-bold',
            'solar:chart-2-linear',
            'solar:leaf-bold',
            'solar:leaf-linear',
            'mdi:bank',
            'mdi:factory',
            'mdi:cellphone-wireless',
            'mdi:cart-outline',
            'mdi:gas-station',
            'mdi:pill',
            'mdi:home-city',
            'mdi:sprout',
            'mdi:television-classic',
            'mdi:fuel',
            'mdi:hospital-box-outline',
            'mdi:shield-check-outline',

            // ── Social sign-in ────────────────────────────────────────
            'logos:google-icon',
            'logos:facebook',
            'mdi:apple',
            'logos:linkedin-icon',

            // ── Were used in code but missing here → rendered blank ──
            'solar:camera-linear',        // KYC review note (selfie next)
            'solar:camera-bold',          // KYC selfie permission card
            'solar:lock-keyhole-bold',    // PIN screen + transaction PIN modal
            'solar:arrow-right-up-bold',  // wallet history
            'solar:refresh-bold',         // wallet history
            'solar:card-transfer-bold',   // wallet history
            'solar:clock-circle-linear',  // wallet history
            'solar:close-square-bold',    // toast close

            // ── Account page (settings-list rows) ─────────────────────
            'solar:shield-check-linear',
            'solar:hashtag-linear',
            'solar:trash-bin-minimalistic-linear',

            // ── Auth / KYC / receipts / account ───────────────────────
            'solar:arrow-left-linear',
            'solar:alt-arrow-up-linear',
            'solar:letter-linear',
            'solar:letter-bold',
            'solar:check-circle-bold',
            'solar:close-circle-bold',
            'solar:clock-circle-bold',
            'solar:verified-check-bold',
            'solar:add-circle-linear',     // IPO shares stepper
            'solar:minus-circle-linear',   // IPO shares stepper
            'solar:ticket-bold',           // Events
            'solar:info-circle-bold',
            'solar:logout-3-linear',
            'solar:logout-3-bold',

            // ── Support & notifications ───────────────────────────────
            'solar:chat-round-line-bold',
            'solar:chat-round-dots-bold',
            'solar:headphones-round-bold',
            'solar:question-circle-linear',
            'solar:question-circle-bold',
            'solar:alt-arrow-down-linear',
            'solar:bell-bold',
            'solar:bell-bing-bold',
          ],
        },
      ],
      // reanimated/plugin MUST be last (docs).
      'react-native-reanimated/plugin',
    ],
  }
}
