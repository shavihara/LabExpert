import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      
      // Actions
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      
      setToken: (token) => set({ token }),
      
      setLoading: (isLoading) => set({ isLoading }),
      
      setError: (error) => set({ error }),
      
      login: async (credentials) => {
        set({ isLoading: true, error: null });
        try {
          // This would be replaced with actual API call
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(credentials),
          });
          
          if (!response.ok) {
            throw new Error('Login failed');
          }
          
          const data = await response.json();
          set({
            user: data.user,
            token: data.token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });
          
          return { success: true };
        } catch (error) {
          set({
            isLoading: false,
            error: error.message
          });
          return { success: false, error: error.message };
        }
      },
      
      logout: () => set({
        user: null,
        token: null,
        isAuthenticated: false,
        error: null
      }),
      
      clearError: () => set({ error: null }),
      
      // Selectors
      getUser: () => get().user,
      getToken: () => get().token,
      isLoggedIn: () => get().isAuthenticated,
      getUserRole: () => get().user?.role || 'user',
      hasPermission: (permission) => {
        const user = get().user;
        return user && user.permissions && user.permissions.includes(permission);
      }
    }),
    {
      name: 'auth-store',
      partialize: (state) => ({
        // Only persist user and token
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);