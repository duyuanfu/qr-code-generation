package com.qrstudio.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qrstudio.common.JwtUtils;
import com.qrstudio.common.UserContext;
import com.qrstudio.entity.User;
import com.qrstudio.mapper.UserMapper;
import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 鉴权拦截器的路径规则。
 *
 * <p>重点盯两条安全边界：
 * <ul>
 *   <li>上传接口匿名不可达（此前任何人都能往磁盘写文件）</li>
 *   <li>账号禁用 / 角色变更对已签发的旧 token 立即生效</li>
 * </ul>
 */
class AuthInterceptorTest {

    private final JwtUtils jwtUtils = mock(JwtUtils.class);

    private final UserMapper userMapper = mock(UserMapper.class);

    private final AuthInterceptor interceptor =
            new AuthInterceptor(jwtUtils, new ObjectMapper(), userMapper);

    @AfterEach
    void clearContext() {
        UserContext.clear();
    }

    private MockHttpServletRequest request(String method, String uri, String token) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        if (token != null) {
            request.addHeader("Authorization", "Bearer " + token);
        }
        return request;
    }

    private void loginAs(String token, String userId) {
        Claims claims = mock(Claims.class);
        when(claims.get("userId", String.class)).thenReturn(userId);
        when(jwtUtils.validateToken(token)).thenReturn(true);
        when(jwtUtils.parseToken(token)).thenReturn(claims);
    }

    private User user(String id, String role, String status) {
        return User.builder().id(id).email(id + "@example.com").role(role).status(status).build();
    }

    @Test
    @DisplayName("匿名上传被 401 拦截")
    void rejectsAnonymousUpload() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean passed = interceptor.preHandle(request("POST", "/api/upload", null), response, new Object());

        assertFalse(passed);
        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("登录"), response.getContentAsString());
    }

    @Test
    @DisplayName("登录用户上传放行，且身份写入 UserContext")
    void allowsAuthenticatedUpload() throws Exception {
        loginAs("token-a", "u1");
        when(userMapper.selectById("u1")).thenReturn(user("u1", "user", "active"));

        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean passed = interceptor.preHandle(request("POST", "/api/upload", "token-a"), response, new Object());

        assertTrue(passed);
        assertEquals(200, response.getStatus());
        assertNotNull(UserContext.get());
        assertEquals("u1", UserContext.get().getUserId());
    }

    @Test
    @DisplayName("已禁用账号的旧 token 即使签名有效也不被采信")
    void rejectsDisabledUserToken() throws Exception {
        loginAs("token-b", "u2");
        when(userMapper.selectById("u2")).thenReturn(user("u2", "user", "disabled"));

        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean passed = interceptor.preHandle(request("POST", "/api/upload", "token-b"), response, new Object());

        assertNull(UserContext.get(), "禁用账号不应写入身份");
        assertFalse(passed);
        assertEquals(401, response.getStatus());
    }

    @Test
    @DisplayName("非 admin 访问管理接口返回 403")
    void forbidsNonAdminOnAdminPath() throws Exception {
        loginAs("token-c", "u3");
        when(userMapper.selectById("u3")).thenReturn(user("u3", "user", "active"));

        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean passed = interceptor.preHandle(request("GET", "/api/admin/users", "token-c"), response, new Object());

        assertFalse(passed);
        assertEquals(403, response.getStatus());
    }

    @Test
    @DisplayName("管理员访问管理接口放行")
    void allowsAdminOnAdminPath() throws Exception {
        loginAs("token-d", "u4");
        when(userMapper.selectById("u4")).thenReturn(user("u4", "admin", "active"));

        MockHttpServletResponse response = new MockHttpServletResponse();
        boolean passed = interceptor.preHandle(request("GET", "/api/admin/users", "token-d"), response, new Object());

        assertTrue(passed);
    }

    @Test
    @DisplayName("未登录访问管理接口返回 401")
    void rejectsAnonymousAdmin() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean passed = interceptor.preHandle(request("GET", "/api/admin/orders", null), response, new Object());

        assertFalse(passed);
        assertEquals(401, response.getStatus());
    }

    @Test
    @DisplayName("公开接口保持匿名可访问")
    void keepsPublicPathsOpen() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean passed = interceptor.preHandle(request("GET", "/api/payment/config", null), response, new Object());

        assertTrue(passed);
        assertEquals(200, response.getStatus());
    }

    @Test
    @DisplayName("OPTIONS 预检请求直接放行，不要求身份")
    void allowsCorsPreflight() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean passed = interceptor.preHandle(request("OPTIONS", "/api/upload", null), response, new Object());

        assertTrue(passed);
    }

    @Test
    @DisplayName("被拒请求不把身份残留给同线程的下一个匿名请求")
    void doesNotLeakIdentityBetweenRequests() throws Exception {
        loginAs("token-c", "u3");
        when(userMapper.selectById("u3")).thenReturn(user("u3", "user", "active"));

        // 第一次：普通用户访问管理接口 -> 403，preHandle 返回 false，
        // 此时 Spring 不会回调 afterCompletion，ThreadLocal 会残留身份
        interceptor.preHandle(request("GET", "/api/admin/users", "token-c"), new MockHttpServletResponse(), new Object());

        // 第二次：同一线程上的匿名请求，必须是 401 而不是 403（403 说明继承了上一个用户）
        MockHttpServletResponse second = new MockHttpServletResponse();
        boolean passed = interceptor.preHandle(request("GET", "/api/admin/users", null), second, new Object());

        assertFalse(passed);
        assertEquals(401, second.getStatus(), "匿名请求不应继承上一个请求的身份");
        assertNull(UserContext.get());
    }
}
