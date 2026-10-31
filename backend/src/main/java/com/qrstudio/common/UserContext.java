package com.qrstudio.common;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public class UserContext {
    private static final ThreadLocal<CurrentUser> CURRENT_USER = new ThreadLocal<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CurrentUser {
        private String userId;
        private String email;
        private String role;
    }

    public static void set(CurrentUser user) {
        CURRENT_USER.set(user);
    }

    public static CurrentUser get() {
        return CURRENT_USER.get();
    }

    public static void clear() {
        CURRENT_USER.remove();
    }
}
