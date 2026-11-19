import { createContext, useContext } from 'react';

export type User = { id: number; username: string };
const UserContext = createContext<User>({ id: 0, username: '' });
export const UserProvider = UserContext.Provider;
export const useUser = () => useContext(UserContext);
