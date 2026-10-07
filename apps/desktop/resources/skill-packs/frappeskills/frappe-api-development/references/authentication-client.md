# Client-Side Authentication (frappe-ui)

Vue/frappe-ui patterns: session state, login/logout, route guards, and
session timeout. Server-side session/permission checks:
[authentication-server.md](authentication-server.md).

## Session/User State

`frappe-ui` exports no `user` ref, session store, or login/logout resource
— confirmed absent from `src/index.ts` in both the `0.1.261` baseline and
the v1 beta (`src/index.ts` has no `user`/`session` export in either
tree). Every Frappe SPA builds this itself on top of `createResource` (or
`useCall` `(v1)`), seeded from the `user_id` cookie the Desk login sets.
This is the pattern used by Frappe CRM (`frontend/src/stores/session.js`)
and HRMS (`frontend/src/data/session.js`):

```javascript
// data/session.js
import { computed, reactive } from 'vue'
import { createResource, call } from 'frappe-ui'

function sessionUser() {
  let cookies = new URLSearchParams(document.cookie.split('; ').join('&'))
  let name = cookies.get('user_id')
  return name === 'Guest' ? null : name
}

// Roles are not part of the session cookie — fetch and cache them
// separately with the stock `get_roles` whitelisted method.
const roles = createResource({
  url: 'frappe.core.doctype.user.user.get_roles',
  cache: 'session-roles',
  auto: !!sessionUser(),
})

export const session = reactive({
  user: sessionUser(),
  isLoggedIn: computed(() => !!session.user),
  hasRole: (role) => (roles.data || []).includes(role),
  login: async (usr, pwd) => {
    let response = await call('login', { usr, pwd })
    session.user = sessionUser()
    roles.reload()
    return response
  },
  logout: createResource({
    url: 'logout',
    onSuccess() {
      session.user = null
      roles.reset()
      window.location.href = '/login'
    },
  }),
})
```

`session.user` only ever holds the logged-in user's `name` (the cookie's
value) — not `full_name`, `email`, or other profile fields. Two ways to get
those: (1) the `frappe-ui/vite` plugin's `jinjaBootData: true` option injects
a server-populated `context.boot` object onto `window` — put
`context.boot.user_info = frappe.session.user_info` in the page's Python
`get_context` and read `window.user_info` client-side (`vite/README.md`
"Jinja Boot Data"); (2) fetch on demand with a cached `createResource`
(HRMS's `get_current_user_info` pattern) or the stock
`frappe.client.get_value` (`doctype: 'User'`, `filters: session.user`).

## Login Component

```vue
<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="max-w-md w-full bg-white rounded-lg shadow-sm p-8">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-gray-900">Sign In</h1>
        <p class="text-sm text-gray-500 mt-2">Enter your credentials to access</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <FormControl
          v-model="form.username"
          label="Username"
          type="text"
          placeholder="Enter username"
          :disabled="loading"
          required
        />

        <FormControl
          v-model="form.password"
          label="Password"
          type="password"
          placeholder="Enter password"
          :disabled="loading"
          required
        />

        <ErrorMessage v-if="error" :message="error" />

        <Button
          type="submit"
          variant="solid"
          theme="blue"
          class="w-full"
          :loading="loading"
        >
          Sign In
        </Button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { FormControl, Button, ErrorMessage } from 'frappe-ui'
import { call } from 'frappe-ui'

const router = useRouter()

const form = ref({
  username: '',
  password: ''
})

const loading = ref(false)
const error = ref(null)

async function handleLogin() {
  loading.value = true
  error.value = null

  try {
    await call('login', {
      usr: form.value.username,
      pwd: form.value.password
    })

    // Redirect to home or intended page
    router.push('/')
  } catch (err) {
    error.value = err.message || 'Login failed. Please check your credentials.'
  } finally {
    loading.value = false
  }
}
</script>
```

## Logout Function

```javascript
import { call } from 'frappe-ui'

async function logout() {
  try {
    await call('logout')
    // Redirect to login
    window.location.href = '/login'
  } catch (error) {
    console.error('Logout failed:', error)
    // Force redirect even on error
    window.location.href = '/login'
  }
}
```

## Route Guards (Vue Router)

```javascript
// router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import { session } from '@/data/session'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/views/Admin.vue'),
    meta: { requiresAuth: true, roles: ['System Manager'] }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Navigation guard. `session.hasRole` reads from the roles resource that
// `data/session.js` fetches once at login/boot — fetch it during app
// bootstrap (before `app.use(router)`) so it's already resolved here.
router.beforeEach((to, from, next) => {
  const isPublic = to.meta.public
  const requiresAuth = to.meta.requiresAuth
  const requiredRoles = to.meta.roles

  if (isPublic) {
    // Redirect to home if already logged in
    if (session.isLoggedIn && to.name === 'Login') {
      next('/')
    } else {
      next()
    }
  } else if (requiresAuth && !session.isLoggedIn) {
    // Redirect to login if not authenticated
    next({
      name: 'Login',
      query: { redirect: to.fullPath }
    })
  } else if (requiredRoles && !requiredRoles.some((role) => session.hasRole(role))) {
    // Redirect if user doesn't have required role
    next({ name: 'Home' })
  } else {
    next()
  }
})

export default router
```

## Permission Composable

```javascript
// composables/usePermissions.js
import { computed } from 'vue'
import { call } from 'frappe-ui'
import { session } from '@/data/session'

export function usePermissions() {
  const isLoggedIn = computed(() => session.isLoggedIn)

  const hasRole = (role) => session.hasRole(role)

  const hasAnyRole = (roles) => roles.some((role) => session.hasRole(role))

  const hasAllRoles = (roles) => roles.every((role) => session.hasRole(role))

  // `frappe.client.get_doc_permissions` evaluates a saved document, not a
  // bare doctype — there is no stock endpoint for "can I write a Customer
  // that doesn't exist yet"; gate create actions with `hasRole` instead.
  async function hasDocPermission(doctype, docname, permtype) {
    const perms = await call('frappe.client.get_doc_permissions', {
      doctype,
      docname,
    })
    return !!perms?.[permtype]
  }

  const isSystemManager = computed(() => hasRole('System Manager'))
  const isAdmin = computed(() => hasAnyRole(['System Manager', 'Administrator']))

  return {
    isLoggedIn,
    hasRole,
    hasAnyRole,
    hasAllRoles,
    hasDocPermission,
    isSystemManager,
    isAdmin,
    user: computed(() => session.user)
  }
}
```

## Usage in Components

```vue
<template>
  <div>
    <!-- Show based on authentication -->
    <div v-if="isLoggedIn">
      Welcome, {{ user }}!
    </div>

    <!-- Show based on role -->
    <Button
      v-if="isSystemManager"
      @click="adminAction"
    >
      Admin Action
    </Button>

    <!-- Gate a create action by role — no document exists yet for
         get_doc_permissions/hasDocPermission to evaluate -->
    <div v-if="hasRole('Sales User')">
      <Button @click="createCustomer">Create Customer</Button>
    </div>
  </div>
</template>

<script setup>
import { usePermissions } from '@/composables/usePermissions'

const {
  isLoggedIn,
  isSystemManager,
  hasRole,
  user
} = usePermissions()

function adminAction() {
  // Admin-only action
}
</script>
```

## Session Management

### Auto-Logout on Inactivity

```javascript
// composables/useSessionTimeout.js
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { call } from 'frappe-ui'

const TIMEOUT_MINUTES = 30
let timeoutId = null

export function useSessionTimeout() {
  const router = useRouter()
  const warningVisible = ref(false)

  function resetTimeout() {
    if (timeoutId) clearTimeout(timeoutId)

    timeoutId = setTimeout(() => {
      // Show warning before logout
      warningVisible.value = true

      // Logout after 30 more seconds
      setTimeout(() => {
      logout()
      }, 30000)
    }, TIMEOUT_MINUTES * 60 * 1000)
  }

  function logout() {
    call('logout').then(() => {
      window.location.href = '/login'
    })
  }

  function extendSession() {
    warningVisible.value = false
    resetTimeout()
  }

  onMounted(() => {
    // Setup activity listeners
    window.addEventListener('mousemove', resetTimeout)
    window.addEventListener('keypress', resetTimeout)
    window.addEventListener('click', resetTimeout)
    resetTimeout()
  })

  onUnmounted(() => {
    if (timeoutId) clearTimeout(timeoutId)
    window.removeEventListener('mousemove', resetTimeout)
    window.removeEventListener('keypress', resetTimeout)
    window.removeEventListener('click', resetTimeout)
  })

  return {
    warningVisible,
    extendSession,
    logout
  }
}
```

### Session Refresh

```javascript
// Keep session alive with periodic refresh
setInterval(() => {
  call('frappe.ping').catch(() => {
    // Session expired
    window.location.href = '/login'
  })
}, 5 * 60 * 1000) // Every 5 minutes
```

## Sources

See [authentication.md](authentication.md) `## Sources`.
